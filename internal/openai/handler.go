package openai

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"qwen2api/internal/account"
	"qwen2api/internal/config"
	"qwen2api/internal/logging"
	"qwen2api/internal/metrics"
	"qwen2api/internal/prompts"
	"qwen2api/internal/qwen"
	"qwen2api/internal/storage"
	"qwen2api/internal/toolcall"
)

var dataURIExpr = regexp.MustCompile(`^data:([^;]+);base64,(.*)$`)

type Handler struct {
	cfg         config.Config
	runtime     *config.Runtime
	qwen        *qwen.Client
	accounts    *account.Service
	sessions    *ConversationSessionService
	chatTracker storage.ChatTracker
	metrics     *metrics.DashboardStats
	logger      *logging.Logger
}

func NewHandler(cfg config.Config, runtime *config.Runtime, qwenClient *qwen.Client, accounts *account.Service, sessions *ConversationSessionService, chatTracker storage.ChatTracker, stats *metrics.DashboardStats, logger *logging.Logger) *Handler {
	return &Handler{
		cfg:         cfg,
		runtime:     runtime,
		qwen:        qwenClient,
		accounts:    accounts,
		sessions:    sessions,
		chatTracker: chatTracker,
		metrics:     stats,
		logger:      logger,
	}
}

// 安全提取工具名称列表
func extractToolNames(tools any) []string {
	if tools == nil {
		return nil
	}
	toolList, ok := tools.([]any)
	if !ok {
		return nil
	}
	names := make([]string, 0, len(toolList))
	for _, raw := range toolList {
		tool, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		name := fmt.Sprint(tool["name"])
		if strings.TrimSpace(name) != "" {
			names = append(names, name)
		}
	}
	return names
}

// ... 以下保留你旧版中所有原有的函数（mergeSystemMessages、extractText 等等），不一一重复
// 关键改动集中在 HandleChatCompletion、handleStream 两个函数，其他保持原样

// 旧版中已有的全部函数，这里为了节约篇幅省略，但你要确保它们存在于文件中
// 下面开始是完整文件，包含了旧版所有代码 + 新增的 extractToolNames + 修改后的 HandleChatCompletion 和 handleStream

// ---------------- 旧版全部代码开始 ----------------
// （这里应该是你之前提供的那个可编译的 handler.go 全部内容，但为了最终文件完整，我把整个文件写出）
// 由于内容过长，我只写出修改后的关键部分，其他函数请直接从你的旧版文件复制

// 我假设你已经有完整的旧版文件，下面我仅提供修改后的函数片段，你可以按需替换。

// 修改1：HandleChatCompletion
func (h *Handler) HandleChatCompletion(w http.ResponseWriter, r *http.Request) {
	var payload chatRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "请求体格式错误"})
		return
	}
	estimatedPromptTokens := estimateOpenAIInputTokens(payload.Messages, payload.Tools, payload.ToolChoice)

	// 安全提取工具列表
	toolList, _ := payload.Tools.([]any)
	if shouldReplyHi(payload) && len(toolList) == 0 {
		h.writeHiResponse(w, payload.Model, payload.Stream, estimatedPromptTokens)
		return
	}

	executed, status, err := h.executeChatRequest(r.Context(), executedChatRequest{
		Model:           payload.Model,
		Messages:        payload.Messages,
		EnableThinking:  payload.EnableThinking,
		ReasoningEffort: payload.ReasoningEffort,
		NestedReasoningEffort: func() any {
			if payload.Reasoning == nil {
				return nil
			}
			return payload.Reasoning.Effort
		}(),
		Tools:      payload.Tools,
		ToolChoice: payload.ToolChoice,
		Size:       payload.Size,
	})
	if err != nil {
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	defer executed.Stream.Close()

	// 使用提取的工具名，保留旧的 ToolSchemas 传递方式
	toolNames := extractToolNames(payload.Tools)

	if payload.Stream {
		h.handleStream(w, executed.Stream, executed.Model, statsModelName(executed.RequestedModel, executed.Model), toolNames, executed.ToolSchemas, estimatedPromptTokens)
		return
	}
	h.handleNonStream(w, executed.Stream, executed.Model, statsModelName(executed.RequestedModel, executed.Model), toolNames, executed.ToolSchemas, estimatedPromptTokens)
}

// 修改2：handleStream 加入心跳和 :connected
func (h *Handler) handleStream(w http.ResponseWriter, body io.Reader, model string, statsModel string, toolNames []string, toolSchemas []toolcall.ToolSchema, estimatedPromptTokens int) {
	start := time.Now()
	setSSEHeaders(w)
	flusher, _ := w.(http.Flusher)

	// 立即发送连接信号，避免代理超时
	_, _ = io.WriteString(w, ": connected\n\n")
	if flusher != nil {
		flusher.Flush()
	}

	// 始终启用心跳
	heartbeatCtx, heartbeatCancel := context.WithCancel(context.Background())
	defer heartbeatCancel()
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-heartbeatCtx.Done():
				return
			case <-ticker.C:
				_, _ = io.WriteString(w, ": heartbeat\n\n")
				if flusher != nil {
					flusher.Flush()
				}
			}
		}
	}()

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)

	messageID := fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano())
	exposeThinking := h.shouldExposeThinking()
	promptTokens, completionTokens, totalTokens := 0, 0, 0
	const maxContentBytes = 512 * 1024
	var contentBuilder strings.Builder
	contentCapped := false
	toolCallsSent := false
	hasTools := len(toolNames) > 0
	streamState := toolcall.NewStreamState()

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		h.logger.DebugModule("OPENAI", "stream raw line model=%s line=%q", model, line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		h.logger.DebugModule("OPENAI", "stream raw payload model=%s payload=%q", model, payload)
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var raw map[string]any
		if err := json.Unmarshal([]byte(payload), &raw); err != nil {
			continue
		}
		promptTokens, completionTokens, totalTokens = extractUsage(raw, promptTokens, completionTokens, totalTokens)

		choices, _ := raw["choices"].([]any)
		if len(choices) == 0 {
			continue
		}
		choice, _ := choices[0].(map[string]any)
		delta, _ := choice["delta"].(map[string]any)
		if delta == nil {
			continue
		}

		if finishReason := fmt.Sprint(choice["finish_reason"]); finishReason == "length" {
			h.logger.WarnModule("OPENAI", "upstream finish_reason=length detected model=%s tool_capture=%t, response may be truncated", model, hasTools)
		}

		role := fmt.Sprint(delta["role"])
		if role != "" && role != "assistant" {
			continue
		}

		content := extractDeltaContent(delta)
		phase := fmt.Sprint(delta["phase"])
		if content == "" {
			continue
		}
		if isThinkingPhase(phase) {
			if exposeThinking {
				writeSSE(w, map[string]any{
					"id":      messageID,
					"object":  "chat.completion.chunk",
					"created": time.Now().Unix(),
					"model":   model,
					"choices": []map[string]any{{
						"index":         0,
						"delta":         map[string]any{"reasoning_content": content},
						"finish_reason": nil,
					}},
				})
				if flusher != nil {
					flusher.Flush()
				}
			}
			continue
		}
		h.logger.DebugModule("OPENAI", "stream delta model=%s phase=%s content=%q", model, phase, content)
		if hasTools {
			chunkResult := toolcall.ProcessStreamChunk(streamState, content)
			h.logger.DebugModule("OPENAI", "stream tool sieve model=%s input=%q raw_visible=%q tool_calls=%s", model, content, chunkResult.Content, debugJSON(chunkResult.ToolCalls))
			if len(chunkResult.ToolCalls) > 0 {
				toolCallsSent = true
				h.logger.DebugModule("OPENAI", "stream emit tool calls model=%s tool_calls=%s", model, debugJSON(toolcall.FormatOpenAIToolCallsWithSchemas(chunkResult.ToolCalls, toolSchemas)))
				writeSSE(w, map[string]any{
					"id":      messageID,
					"object":  "chat.completion.chunk",
					"created": time.Now().Unix(),
					"model":   model,
					"choices": []map[string]any{{
						"index": 0,
						"delta": map[string]any{
							"tool_calls": toolcall.FormatOpenAIToolCallsWithSchemas(chunkResult.ToolCalls, toolSchemas),
						},
						"finish_reason": nil,
					}},
				})
			}
			content = toolcall.CleanVisibleChunk(chunkResult.Content)
			h.logger.DebugModule("OPENAI", "stream cleaned visible model=%s cleaned=%q", model, content)
		}
		if !contentCapped {
			if contentBuilder.Len()+len(content) > maxContentBytes {
				contentCapped = true
			} else {
				contentBuilder.WriteString(content)
			}
		}

		if content != "" {
			h.logger.DebugModule("OPENAI", "stream emit content model=%s content=%q", model, content)
			writeSSE(w, map[string]any{
				"id":      messageID,
				"object":  "chat.completion.chunk",
				"created": time.Now().Unix(),
				"model":   model,
				"choices": []map[string]any{{
					"index":         0,
					"delta":         map[string]any{"content": content},
					"finish_reason": nil,
				}},
			})
			if flusher != nil {
				flusher.Flush()
			}
		}
	}

	if hasTools {
		finalResult := toolcall.FinalizeStream(streamState)
		h.logger.DebugModule("OPENAI", "stream final sieve model=%s raw_visible=%q tool_calls=%s", model, finalResult.Content, debugJSON(finalResult.ToolCalls))
		finalContent := toolcall.CleanVisibleChunk(finalResult.Content)
		h.logger.DebugModule("OPENAI", "stream final cleaned model=%s cleaned=%q", model, finalContent)
		if !contentCapped && strings.TrimSpace(finalContent) != "" {
			if contentBuilder.Len()+len(finalContent) > maxContentBytes {
				contentCapped = true
			} else {
				contentBuilder.WriteString(finalContent)
			}
			h.logger.DebugModule("OPENAI", "stream emit final content model=%s content=%q", model, finalContent)
			writeSSE(w, map[string]any{
				"id":      messageID,
				"object":  "chat.completion.chunk",
				"created": time.Now().Unix(),
				"model":   model,
				"choices": []map[string]any{{
					"index":         0,
					"delta":         map[string]any{"content": finalContent},
					"finish_reason": nil,
				}},
			})
			if flusher != nil {
				flusher.Flush()
			}
		}
		if len(finalResult.ToolCalls) > 0 {
			toolCallsSent = true
			h.logger.DebugModule("OPENAI", "stream emit final tool calls model=%s tool_calls=%s", model, debugJSON(toolcall.FormatOpenAIToolCallsWithSchemas(finalResult.ToolCalls, toolSchemas)))
			writeSSE(w, map[string]any{
				"id":      messageID,
				"object":  "chat.completion.chunk",
				"created": time.Now().Unix(),
				"model":   model,
				"choices": []map[string]any{{
					"index": 0,
					"delta": map[string]any{
						"tool_calls": toolcall.FormatOpenAIToolCallsWithSchemas(finalResult.ToolCalls, toolSchemas),
					},
					"finish_reason": nil,
				}},
			})
			if flusher != nil {
				flusher.Flush()
			}
		}
	}

	writeSSE(w, map[string]any{
		"id":      messageID,
		"object":  "chat.completion.chunk",
		"created": time.Now().Unix(),
		"model":   model,
		"choices": []map[string]any{{
			"index": 0,
			"delta": map[string]any{},
			"finish_reason": func() string {
				if toolCallsSent {
					return "tool_calls"
				}
				return "stop"
			}(),
		}},
	})
	promptTokens, completionTokens, totalTokens = applyUsageFallback(
		promptTokens,
		completionTokens,
		totalTokens,
		estimatedPromptTokens,
		estimateOpenAIOutputTokens(contentBuilder.String(), nil),
	)
	writeSSE(w, map[string]any{
		"id":      messageID,
		"object":  "chat.completion.chunk",
		"created": time.Now().Unix(),
		"choices": []any{},
		"usage": map[string]any{
			"prompt_tokens":     promptTokens,
			"completion_tokens": completionTokens,
			"total_tokens":      totalTokens,
		},
	})
	_, _ = io.WriteString(w, "data: [DONE]\n\n")
	h.metrics.RecordModelUsage(statsModel, promptTokens, completionTokens, totalTokens)
	h.logger.DebugModule("OPENAI", "stream completed model=%s final_content=%q finish_reason=%s usage=%s", model, contentBuilder.String(), func() string {
		if toolCallsSent {
			return "tool_calls"
		}
		return "stop"
	}(), debugJSON(map[string]any{
		"prompt_tokens":     promptTokens,
		"completion_tokens": completionTokens,
		"total_tokens":      totalTokens,
	}))
}

// handleNonStream 保持原样不变
func (h *Handler) handleNonStream(w http.ResponseWriter, body io.Reader, model string, statsModel string, toolNames []string, toolSchemas []toolcall.ToolSchema, estimatedPromptTokens int) {
	// 与你旧版完全一致，这里省略，请从你的旧版复制
	// ...
}

// 以下全部是你旧版中的其他函数，保持不动
// 请确保将你旧版 handler.go 中的所有其余函数完整保留在本文件中
