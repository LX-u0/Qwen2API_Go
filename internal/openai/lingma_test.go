package openai

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"qwen2api/internal/config"
	lingmaservice "qwen2api/internal/lingma/service"
	"qwen2api/internal/logging"
	"qwen2api/internal/metrics"
)

func TestSplitLingmaModelRequiresSuffix(t *testing.T) {
	base, ok := splitLingmaModel("kmodel-lingma")
	if !ok || base != "kmodel" {
		t.Fatalf("splitLingmaModel = (%q, %v), want (kmodel, true)", base, ok)
	}

	base, ok = splitLingmaModel("qwen3-max")
	if ok || base != "qwen3-max" {
		t.Fatalf("splitLingmaModel non-lingma = (%q, %v), want unchanged false", base, ok)
	}
}

func TestListLingmaModelVariantsAddsOnlyLingmaSuffix(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/algo/api/v2/model/list" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"chat": []map[string]any{{
				"key":          "dashscope_qwen3_coder",
				"display_name": "Qwen3-Coder",
				"enable":       true,
			}},
		})
	}))
	defer upstream.Close()

	handler := &Handler{
		lingma: lingmaTestService(t, upstream.URL, ""),
		logger: logging.New(false),
	}
	models := handler.listLingmaModelVariants(t.Context())
	if len(models) != 1 {
		t.Fatalf("models len = %d, want 1", len(models))
	}
	if models[0]["id"] != "qwen3_coder-lingma" || models[0]["name"] != "qwen3_coder-lingma" || models[0]["display_name"] != "qwen3_coder-lingma" || models[0]["owned_by"] != "lingma" || models[0]["upstream_id"] != "dashscope_qwen3_coder" {
		t.Fatalf("unexpected variant: %#v", models[0])
	}
}

func TestBuildLingmaRequestRestoresDashscopePrefixForShortPublicModel(t *testing.T) {
	handler := &Handler{}
	request, responseModel, err := handler.buildLingmaChatRequest(chatRequest{
		Model:    "qwen_max_latest-lingma",
		Messages: []map[string]any{{"role": "user", "content": "hi"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if request.Model != "dashscope_qwen_max_latest" {
		t.Fatalf("request model = %q, want dashscope_qwen_max_latest", request.Model)
	}
	if responseModel != "qwen_max_latest-lingma" {
		t.Fatalf("response model = %q, want qwen_max_latest-lingma", responseModel)
	}
}

func TestBuildLingmaRequestIgnoresQwenWeb2ControlPrompt(t *testing.T) {
	handler := &Handler{
		runtime: config.NewRuntime(config.Config{QwenWeb2ControlPrompt: "backend control"}),
	}
	request, _, err := handler.buildLingmaChatRequest(chatRequest{
		Model: "qwen_max_latest-lingma",
		Messages: []map[string]any{
			{"role": "system", "content": "user system"},
			{"role": "user", "content": "hello"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if request.System != "user system" {
		t.Fatalf("request.System = %q, want user system", request.System)
	}
	if strings.Contains(request.System, "backend control") {
		t.Fatalf("request.System leaked qwen control prompt: %q", request.System)
	}
}

func TestHandleLingmaChatCompletionNonStreamToolCalls(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/algo/api/v2/service/pro/sse/agent_chat_generation" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(strings.Join([]string{
			`data: {"body":"{\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\\\"README.md\\\"}\"}}]}}]}","statusCodeValue":200}`,
			"",
			`data: [DONE]`,
			"",
		}, "\n")))
	}))
	defer upstream.Close()

	handler := &Handler{
		lingma:  lingmaTestService(t, upstream.URL, ""),
		metrics: metrics.NewDashboardStats(),
		logger:  logging.New(false),
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{
		"model":"kmodel-lingma",
		"messages":[{"role":"user","content":"read file"}],
		"tools":[{"type":"function","function":{"name":"read_file","parameters":{"type":"object"}}}]
	}`))
	recorder := httptest.NewRecorder()

	handler.HandleChatCompletion(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["model"] != "kmodel-lingma" {
		t.Fatalf("model = %v", payload["model"])
	}
	choice := payload["choices"].([]any)[0].(map[string]any)
	if choice["finish_reason"] != "tool_calls" {
		t.Fatalf("finish_reason = %v", choice["finish_reason"])
	}
	message := choice["message"].(map[string]any)
	calls := message["tool_calls"].([]any)
	fn := calls[0].(map[string]any)["function"].(map[string]any)
	if fn["name"] != "read_file" || !strings.Contains(fn["arguments"].(string), "README.md") {
		t.Fatalf("unexpected tool call: %#v", calls[0])
	}
}

func TestHandleLingmaChatCompletionParsesNestedJSONArgumentStrings(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(strings.Join([]string{
			`data: {"body":"{\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"question\",\"arguments\":\"{\\\"questions\\\":\\\"[{\\\\\\\"question\\\\\\\":\\\\\\\"X\\\\\\\",\\\\\\\"options\\\\\\\":[\\\\\\\"a\\\\\\\",\\\\\\\"b\\\\\\\",\\\\\\\"c\\\\\\\"],\\\\\\\"required\\\\\\\":true}]\\\"}\"}}]}}]}","statusCodeValue":200}`,
			"",
			`data: [DONE]`,
			"",
		}, "\n")))
	}))
	defer upstream.Close()

	handler := &Handler{
		lingma:  lingmaTestService(t, upstream.URL, ""),
		metrics: metrics.NewDashboardStats(),
		logger:  logging.New(false),
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{
		"model":"kmodel-lingma",
		"messages":[{"role":"user","content":"ask"}],
		"tools":[{"type":"function","function":{"name":"question","parameters":{"type":"object"}}}]
	}`))
	recorder := httptest.NewRecorder()

	handler.HandleChatCompletion(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	choice := payload["choices"].([]any)[0].(map[string]any)
	message := choice["message"].(map[string]any)
	calls := message["tool_calls"].([]any)
	fn := calls[0].(map[string]any)["function"].(map[string]any)
	var args map[string]any
	if err := json.Unmarshal([]byte(fn["arguments"].(string)), &args); err != nil {
		t.Fatal(err)
	}
	questions, ok := args["questions"].([]any)
	if !ok || len(questions) != 1 {
		t.Fatalf("questions = %#v, want native array", args["questions"])
	}
}

func lingmaTestService(t *testing.T, baseURL string, model string) *lingmaservice.Service {
	t.Helper()
	authFile := filepath.Join(t.TempDir(), "credentials.json")
	body := `{
		"source":"test",
		"token_expire_time":"4102444800000",
		"auth":{
			"cosy_key":"cosy-key",
			"encrypt_user_info":"encrypted-user",
			"user_id":"user-1",
			"machine_id":"machine-1"
		}
	}`
	if err := os.WriteFile(authFile, []byte(body), 0644); err != nil {
		t.Fatal(err)
	}
	return lingmaservice.New(lingmaservice.Config{
		RemoteBaseURL:  baseURL,
		RemoteAuthFile: authFile,
		Model:          model,
	})
}
