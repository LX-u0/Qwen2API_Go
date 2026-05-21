package openai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	lingmaservice "qwen2api/internal/lingma/service"
	"qwen2api/internal/lingma/toolemulation"
	"qwen2api/internal/toolargs"
)

const lingmaModelSuffix = "-lingma"

func splitLingmaModel(model string) (string, bool) {
	model = strings.TrimSpace(model)
	if !strings.HasSuffix(strings.ToLower(model), lingmaModelSuffix) {
		return model, false
	}
	base := strings.TrimSpace(model[:len(model)-len(lingmaModelSuffix)])
	return base, true
}

func withLingmaSuffix(model string) string {
	model = strings.TrimSpace(model)
	if model == "" {
		model = "lingma"
	}
	if strings.HasSuffix(strings.ToLower(model), lingmaModelSuffix) {
		return model
	}
	return model + lingmaModelSuffix
}

func publicLingmaModelID(upstreamID string) string {
	upstreamID = strings.TrimSpace(upstreamID)
	return strings.TrimPrefix(upstreamID, "dashscope_")
}

func upstreamLingmaModelID(publicID string) string {
	publicID = strings.TrimSpace(publicID)
	lower := strings.ToLower(publicID)
	if strings.HasPrefix(lower, "dashscope_") || publicID == "" {
		return publicID
	}
	if lower == "qmodel" || strings.HasPrefix(lower, "qwen") {
		return "dashscope_" + publicID
	}
	return publicID
}

func (h *Handler) listLingmaModelVariants(ctx context.Context) []map[string]any {
	if h == nil || h.lingma == nil {
		return nil
	}
	models, err := h.lingma.ListModels(ctx)
	if err != nil {
		if h.logger != nil {
			h.logger.WarnModule("LINGMA", "list Lingma models failed: %v", err)
		}
		return nil
	}
	result := make([]map[string]any, 0, len(models))
	for _, model := range models {
		id := strings.TrimSpace(model.ID)
		if id == "" {
			continue
		}
		variant := withLingmaSuffix(publicLingmaModelID(id))
		result = append(result, map[string]any{
			"id":           variant,
			"object":       "model",
			"created":      0,
			"owned_by":     "lingma",
			"name":         variant,
			"upstream_id":  id,
			"display_name": variant,
		})
	}
	return result
}

func (h *Handler) handleLingmaChatCompletion(w http.ResponseWriter, r *http.Request, payload chatRequest, estimatedPromptTokens int) {
	if h == nil || h.lingma == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "Lingma service is not configured"})
		return
	}
	start := time.Now()

	request, responseModel, err := h.buildLingmaChatRequest(payload)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	if h.logger != nil {
		h.logger.InfoModule("OPENAI", "Lingma调用开始 %s model=%s response_model=%s stream=%t", accountLogPrefix("lingma"), request.Model, responseModel, payload.Stream)
	}

	if payload.Stream {
		h.handleLingmaStream(w, r, request, responseModel, estimatedPromptTokens)
		return
	}

	result, err := h.lingma.Generate(r.Context(), request)
	if err != nil {
		if h.logger != nil {
			h.logger.WarnModule("OPENAI", "Lingma调用失败 %s model=%s duration=%s err=%v", accountLogPrefix("lingma"), request.Model, time.Since(start), err)
		}
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	if h.logger != nil {
		label := strings.TrimSpace(result.CredentialSrc)
		if label == "" {
			label = "lingma"
		}
		h.logger.InfoModule("OPENAI", "Lingma调用完成 %s model=%s request_id=%s duration=%s", accountLogPrefix(label), request.Model, result.RequestID, time.Since(start))
	}
	h.writeLingmaNonStream(w, result, responseModel, estimatedPromptTokens)
}

func (h *Handler) buildLingmaChatRequest(payload chatRequest) (lingmaservice.ChatRequest, string, error) {
	model, _ := splitLingmaModel(payload.Model)
	if strings.TrimSpace(model) == "" && h.lingma != nil {
		model = h.lingma.DefaultModel()
	}
	responseModel := withLingmaSuffix(model)
	upstreamModel := upstreamLingmaModelID(model)

	messages := make([]lingmaservice.ChatMessage, 0, len(payload.Messages))
	systemParts := make([]string, 0, 2)
	for _, message := range payload.Messages {
		role := strings.ToLower(strings.TrimSpace(fmt.Sprint(message["role"])))
		switch role {
		case "system", "developer":
			if text := strings.TrimSpace(extractText(message["content"])); text != "" {
				systemParts = append(systemParts, text)
			}
		case "user":
			text, images := lingmaContentParts(message["content"])
			if text != "" || len(images) > 0 {
				messages = append(messages, lingmaservice.ChatMessage{Role: "user", Text: text, Images: images})
			}
		case "assistant":
			text := strings.TrimSpace(extractText(message["content"]))
			calls := lingmaToolCallsFromRaw(message["tool_calls"])
			if text != "" || len(calls) > 0 {
				messages = append(messages, lingmaservice.ChatMessage{Role: "assistant", Text: text, ToolCalls: calls})
			}
		case "tool":
			text := strings.TrimSpace(extractText(message["content"]))
			toolCallID := strings.TrimSpace(fmt.Sprint(message["tool_call_id"]))
			if text != "" && toolCallID != "" {
				messages = append(messages, lingmaservice.ChatMessage{Role: "tool", Text: text, ToolCallID: toolCallID})
			}
		}
	}
	if len(messages) == 0 {
		return lingmaservice.ChatRequest{}, responseModel, fmt.Errorf("no user or assistant messages found")
	}

	return lingmaservice.ChatRequest{
		Model:             upstreamModel,
		System:            strings.Join(systemParts, "\n\n"),
		Messages:          messages,
		Tools:             toolemulation.ExtractTools(payload.Tools),
		ToolChoice:        toolemulation.ExtractToolChoice(payload.ToolChoice),
		ParallelToolCalls: payload.ParallelToolCalls,
		PromptOverrides:   h.promptOverrides(),
		Temperature:       payload.Temperature,
		TopP:              payload.TopP,
		Stop:              lingmaStop(payload.Stop),
		MaxTokens:         lingmaMaxTokens(payload.MaxTokens, payload.MaxCompletionTokens),
		ReasoningEffort:   stringValue(payload.ReasoningEffort),
	}, responseModel, nil
}

func lingmaContentParts(content any) (string, []lingmaservice.Image) {
	switch v := content.(type) {
	case string:
		return strings.TrimSpace(v), nil
	case []any:
		texts := make([]string, 0, len(v))
		images := make([]lingmaservice.Image, 0)
		for _, raw := range v {
			item, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			switch strings.TrimSpace(fmt.Sprint(item["type"])) {
			case "text":
				if text := strings.TrimSpace(fmt.Sprint(item["text"])); text != "" {
					texts = append(texts, text)
				}
			case "image_url":
				if image := lingmaImageFromOpenAIItem(item); image.URL != "" || image.Data != "" {
					images = append(images, image)
				}
			case "input_image", "image":
				if image := lingmaImageFromURL(fmt.Sprint(item["image"])); image.URL != "" || image.Data != "" {
					images = append(images, image)
				}
			}
		}
		return strings.Join(texts, "\n"), images
	default:
		return "", nil
	}
}

func lingmaImageFromOpenAIItem(item map[string]any) lingmaservice.Image {
	switch imageURL := item["image_url"].(type) {
	case string:
		return lingmaImageFromURL(imageURL)
	case map[string]any:
		return lingmaImageFromURL(fmt.Sprint(imageURL["url"]))
	default:
		return lingmaservice.Image{}
	}
}

func lingmaImageFromURL(raw string) lingmaservice.Image {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return lingmaservice.Image{}
	}
	if matches := dataURIExpr.FindStringSubmatch(raw); len(matches) == 3 {
		return lingmaservice.Image{
			MediaType: strings.TrimSpace(matches[1]),
			Data:      strings.TrimSpace(matches[2]),
			URL:       raw,
		}
	}
	return lingmaservice.Image{URL: raw}
}

func lingmaToolCallsFromRaw(raw any) []toolemulation.ToolCall {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	calls := make([]toolemulation.ToolCall, 0, len(items))
	for _, rawItem := range items {
		item, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		fn, _ := item["function"].(map[string]any)
		name := strings.TrimSpace(fmt.Sprint(fn["name"]))
		if name == "" {
			continue
		}
		calls = append(calls, toolemulation.ToolCall{
			ID:        strings.TrimSpace(fmt.Sprint(item["id"])),
			Name:      name,
			Arguments: lingmaToolArguments(fn["arguments"]),
		})
	}
	return calls
}

func lingmaToolArguments(raw any) map[string]any {
	switch v := raw.(type) {
	case map[string]any:
		return toolargs.NormalizeJSONStrings(v)
	case string:
		var parsed map[string]any
		if err := json.Unmarshal([]byte(v), &parsed); err == nil && parsed != nil {
			return toolargs.NormalizeJSONStrings(parsed)
		}
		if strings.TrimSpace(v) != "" {
			return map[string]any{"raw_arguments": v}
		}
	}
	return map[string]any{}
}

func lingmaStop(stop any) []string {
	switch v := stop.(type) {
	case string:
		if strings.TrimSpace(v) == "" {
			return nil
		}
		return []string{strings.TrimSpace(v)}
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if value := strings.TrimSpace(fmt.Sprint(item)); value != "" {
				out = append(out, value)
			}
		}
		return out
	default:
		return nil
	}
}

func lingmaMaxTokens(maxTokens, maxCompletionTokens int) int {
	if maxCompletionTokens > 0 {
		return maxCompletionTokens
	}
	return maxTokens
}

func (h *Handler) writeLingmaNonStream(w http.ResponseWriter, result *lingmaservice.ChatResult, model string, estimatedPromptTokens int) {
	if result == nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "Lingma returned empty result"})
		return
	}
	promptTokens, completionTokens, totalTokens := applyUsageFallback(
		result.InputTokens,
		result.OutputTokens,
		result.InputTokens+result.OutputTokens,
		estimatedPromptTokens,
		estimateLingmaOutputTokens(result.Text, result.ToolCalls),
	)
	message := map[string]any{"role": "assistant", "content": result.Text}
	finishReason := "stop"
	if len(result.ToolCalls) > 0 {
		message["tool_calls"] = formatLingmaToolCalls(result.ToolCalls)
		finishReason = "tool_calls"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":      fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano()),
		"object":  "chat.completion",
		"created": time.Now().Unix(),
		"model":   model,
		"choices": []map[string]any{{
			"index":         0,
			"message":       message,
			"finish_reason": finishReason,
		}},
		"usage": map[string]any{
			"prompt_tokens":     promptTokens,
			"completion_tokens": completionTokens,
			"total_tokens":      totalTokens,
		},
	})
	if h.metrics != nil {
		h.metrics.RecordModelUsage(model, promptTokens, completionTokens, totalTokens)
	}
}

func (h *Handler) handleLingmaStream(w http.ResponseWriter, r *http.Request, request lingmaservice.ChatRequest, model string, estimatedPromptTokens int) {
	start := time.Now()
	events, done, err := h.lingma.GenerateStream(r.Context(), request)
	if err != nil {
		if h.logger != nil {
			h.logger.WarnModule("OPENAI", "Lingma调用失败 %s mode=stream model=%s duration=%s err=%v", accountLogPrefix("lingma"), request.Model, time.Since(start), err)
		}
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}

	setSSEHeaders(w)
	flusher, _ := w.(http.Flusher)
	messageID := fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano())
	created := time.Now().Unix()
	writeSSE(w, map[string]any{
		"id":      messageID,
		"object":  "chat.completion.chunk",
		"created": created,
		"model":   model,
		"choices": []map[string]any{{
			"index":         0,
			"delta":         map[string]any{"role": "assistant"},
			"finish_reason": nil,
		}},
	})
	flushLingma(flusher)

	var result *lingmaservice.ChatResult
	var finalErr error
	for events != nil || done != nil {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				events = nil
				continue
			}
			if event.Delta == "" {
				continue
			}
			writeSSE(w, map[string]any{
				"id":      messageID,
				"object":  "chat.completion.chunk",
				"created": created,
				"model":   model,
				"choices": []map[string]any{{
					"index":         0,
					"delta":         map[string]any{"content": event.Delta},
					"finish_reason": nil,
				}},
			})
			flushLingma(flusher)
		case final, ok := <-done:
			if !ok {
				done = nil
				continue
			}
			result = final.Result
			finalErr = final.Err
			done = nil
		}
	}

	if finalErr != nil {
		if h.logger != nil {
			h.logger.WarnModule("OPENAI", "Lingma调用失败 %s mode=stream model=%s duration=%s err=%v", accountLogPrefix("lingma"), request.Model, time.Since(start), finalErr)
		}
		writeSSE(w, map[string]any{"error": map[string]any{"message": finalErr.Error(), "type": "api_error"}})
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
		flushLingma(flusher)
		return
	}
	if result == nil {
		if h.logger != nil {
			h.logger.WarnModule("OPENAI", "Lingma调用失败 %s mode=stream model=%s duration=%s err=%s", accountLogPrefix("lingma"), request.Model, time.Since(start), "empty_final_result")
		}
		writeSSE(w, map[string]any{"error": map[string]any{"message": "Lingma stream finished without a final result", "type": "api_error"}})
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
		flushLingma(flusher)
		return
	}

	for _, callChunk := range formatLingmaToolCallChunks(result.ToolCalls) {
		writeSSE(w, map[string]any{
			"id":      messageID,
			"object":  "chat.completion.chunk",
			"created": created,
			"model":   model,
			"choices": []map[string]any{{
				"index":         0,
				"delta":         map[string]any{"tool_calls": []map[string]any{callChunk}},
				"finish_reason": nil,
			}},
		})
		flushLingma(flusher)
	}

	finishReason := "stop"
	if len(result.ToolCalls) > 0 {
		finishReason = "tool_calls"
	}
	writeSSE(w, map[string]any{
		"id":      messageID,
		"object":  "chat.completion.chunk",
		"created": created,
		"model":   model,
		"choices": []map[string]any{{
			"index":         0,
			"delta":         map[string]any{},
			"finish_reason": finishReason,
		}},
	})
	promptTokens, completionTokens, totalTokens := applyUsageFallback(
		result.InputTokens,
		result.OutputTokens,
		result.InputTokens+result.OutputTokens,
		estimatedPromptTokens,
		estimateLingmaOutputTokens(result.Text, result.ToolCalls),
	)
	if h.metrics != nil {
		h.metrics.RecordModelUsage(model, promptTokens, completionTokens, totalTokens)
	}
	if h.logger != nil {
		label := strings.TrimSpace(result.CredentialSrc)
		if label == "" {
			label = "lingma"
		}
		h.logger.InfoModule("OPENAI", "Lingma调用完成 %s mode=stream model=%s request_id=%s finish_reason=%s duration=%s", accountLogPrefix(label), request.Model, result.RequestID, finishReason, time.Since(start))
	}
	_, _ = w.Write([]byte("data: [DONE]\n\n"))
	flushLingma(flusher)
}

func flushLingma(flusher http.Flusher) {
	if flusher != nil {
		flusher.Flush()
	}
}

func formatLingmaToolCalls(calls []toolemulation.ToolCall) []map[string]any {
	out := make([]map[string]any, 0, len(calls))
	for _, call := range calls {
		args, _ := json.Marshal(toolargs.NormalizeJSONStrings(call.Arguments))
		out = append(out, map[string]any{
			"id":   call.ID,
			"type": "function",
			"function": map[string]any{
				"name":      call.Name,
				"arguments": string(args),
			},
		})
	}
	return out
}

func formatLingmaToolCallChunks(calls []toolemulation.ToolCall) []map[string]any {
	out := make([]map[string]any, 0, len(calls))
	for i, call := range calls {
		args, _ := json.Marshal(toolargs.NormalizeJSONStrings(call.Arguments))
		out = append(out, map[string]any{
			"index": i,
			"id":    call.ID,
			"type":  "function",
			"function": map[string]any{
				"name":      call.Name,
				"arguments": string(args),
			},
		})
	}
	return out
}

func estimateLingmaOutputTokens(content string, calls []toolemulation.ToolCall) int {
	total := estimateTextTokens(content)
	for _, call := range calls {
		total += estimateTextTokens(call.Name)
		total += estimatePayloadTokens(call.Arguments)
	}
	if total <= 0 {
		return 1
	}
	return total
}
