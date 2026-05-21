package remote

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"qwen2api/internal/lingma/toolemulation"
)

func TestNewKeepsZeroTimeoutUnlimited(t *testing.T) {
	client := New(Config{Timeout: 0})
	if client.client.Timeout != 0 {
		t.Fatalf("timeout = %v, want 0", client.client.Timeout)
	}
}

func TestNewKeepsPositiveTimeout(t *testing.T) {
	client := New(Config{Timeout: 7 * time.Second})
	if client.client.Timeout != 7*time.Second {
		t.Fatalf("timeout = %v, want 7s", client.client.Timeout)
	}
}

func TestExtractBaseURLFromEndpointLog(t *testing.T) {
	got := extractBaseURLFromText(`2026-04-10 INFO Update endpoint success. endpoint config: https://ai-lingma-example-cn-beijing.rdc.aliyuncs.com`)
	want := "https://ai-lingma-example-cn-beijing.rdc.aliyuncs.com"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestExtractBaseURLFromMarketplaceLog(t *testing.T) {
	got := extractBaseURLFromText(`2026-04-30 [info] [Marketplace] Using service url: https://ai-lingma-example-cn-beijing.rdc.aliyuncs.com/marketplace/_apis/public/gallery`)
	want := "https://ai-lingma-example-cn-beijing.rdc.aliyuncs.com"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestExtractBaseURLFromRawWindowsLogURL(t *testing.T) {
	got := extractBaseURLFromText(`2026-05-06T12:00:00 endpoint=https://ai-lingma-example-cn-beijing.rdc.aliyuncs.com/algo/api/v2/model/list`)
	want := "https://ai-lingma-example-cn-beijing.rdc.aliyuncs.com"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestExtractBaseURLIgnoresLingmaOSSAssetHost(t *testing.T) {
	got := extractBaseURLFromText(`2026-05-06 endpoint config: https://ai-lingma-example-cn-beijing.rdc.aliyuncs.com
2026-05-06 Download asset from: https://lingma-ide.oss-rg-china-mainland.aliyuncs.com/lingma-extension/download?name=plugin.zip`)
	want := "https://ai-lingma-example-cn-beijing.rdc.aliyuncs.com"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestNormalizeBaseURLRepairsMissingLeadingH(t *testing.T) {
	got := normalizeRemoteBaseURLHint(`ttps://ai-lingma-example-cn-beijing.rdc.aliyuncs.com`)
	want := "https://ai-lingma-example-cn-beijing.rdc.aliyuncs.com"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestNormalizeBaseURLRejectsLingmaOSSAssetHost(t *testing.T) {
	if got := normalizeRemoteBaseURLHint(`https://lingma-ide.oss-rg-china-mainland.aliyuncs.com/lingma-extension/download`); got != "" {
		t.Fatalf("got %q, want empty", got)
	}
}

func TestNormalizeBaseURLRejectsUnsupportedScheme(t *testing.T) {
	if got := normalizeRemoteBaseURLHint(`ftp://ai-lingma-example-cn-beijing.rdc.aliyuncs.com`); got != "" {
		t.Fatalf("got %q, want empty", got)
	}
}

func TestModelListStatusErrorSuggestsManualRemoteBaseURLOn404(t *testing.T) {
	client := New(Config{BaseURL: "https://lingma-ide.oss-rg-china-mainland.aliyuncs.com"})
	err := client.modelListStatusError("https://lingma-ide.oss-rg-china-mainland.aliyuncs.com/algo", 404, `<Error><Code>NoSuchKey</Code></Error>`)
	if err == nil {
		t.Fatal("expected error")
	}
	text := err.Error()
	for _, want := range []string{
		"https://lingma-ide.oss-rg-china-mainland.aliyuncs.com",
		"远端 API 域名自动探测命中了错误地址",
		"https://lingma-api.tongyi.aliyun.com/algo",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("error %q missing %q", text, want)
		}
	}
}

func TestResolveBaseURLsNormalizesProtocolEndpoint(t *testing.T) {
	got := ResolveBaseURLs("https://example.test,https://example2.test/custom/algo/api/v2/model/list")
	want := []string{"https://example.test/algo", "https://example2.test/custom/algo"}
	if len(got) != len(want) {
		t.Fatalf("base URLs = %#v, want %#v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("base URL %d = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestChatRequestPathDefaultsToAgentChatGeneration(t *testing.T) {
	client := New(Config{})
	got := client.chatRequestPath()
	want := "/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common"
	if got != want {
		t.Fatalf("chat path = %q, want %q", got, want)
	}
}

func TestBuildBodyDefaultsToAgentChatGenerationSchema(t *testing.T) {
	client := New(Config{})
	body, err := client.buildBody("req-1", ChatRequest{
		Model:  "kmodel",
		Prompt: "read file",
	})
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["task_id"] != "question_refine" || payload["agent_id"] != "agent_common" {
		t.Fatalf("agent chat fields missing: %#v", payload)
	}
	if _, ok := payload["chatTask"]; ok {
		t.Fatalf("agent chat payload should not include chatTask: %#v", payload)
	}
}

func TestBuildBodyProjectsNativeTools(t *testing.T) {
	client := New(Config{Service: "chat_ask", ChatTask: "question_refine"})
	body, err := client.buildBody("req-1", ChatRequest{
		Model:  "kmodel",
		Prompt: "read file",
		Tools: []toolemulation.ToolDef{{
			Name:        "read_file",
			Description: "Read a local file",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"file_path": map[string]any{"type": "string"},
				},
				"required": []any{"file_path"},
			},
		}},
		ToolChoice: toolemulation.ToolChoice{Mode: "tool", Name: "read_file"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		t.Fatal(err)
	}
	tools, ok := payload["tools"].([]any)
	if !ok || len(tools) != 1 {
		t.Fatalf("tools = %#v", payload["tools"])
	}
	tool := tools[0].(map[string]any)
	fn := tool["function"].(map[string]any)
	if tool["type"] != "function" || fn["name"] != "read_file" {
		t.Fatalf("unexpected tool projection: %#v", tool)
	}
	choice := payload["tool_choice"].(map[string]any)
	choiceFn := choice["function"].(map[string]any)
	if choice["type"] != "function" || choiceFn["name"] != "read_file" {
		t.Fatalf("unexpected tool choice: %#v", payload["tool_choice"])
	}
	if payload["requestId"] != "req-1" || payload["questionText"] != "read file" {
		t.Fatalf("pure protocol fields missing: %#v", payload)
	}
	if payload["stream"] != true {
		t.Fatalf("sse chat_ask payload stream = %#v, want true", payload["stream"])
	}
	if payload["chatTask"] != "question_refine" || payload["chat_task"] != "question_refine" {
		t.Fatalf("chat_ask task = %#v/%#v, want question_refine", payload["chatTask"], payload["chat_task"])
	}
	for _, legacy := range []string{"request_set_id", "chat_record_id", "image_urls", "model_config", "business", "agent_id", "task_id"} {
		if _, ok := payload[legacy]; ok {
			t.Fatalf("chat_ask payload should not include legacy %q: %#v", legacy, payload)
		}
	}
}

func TestBuildBodyPreservesStructuredToolMessages(t *testing.T) {
	client := New(Config{})
	body, err := client.buildBody("req-1", ChatRequest{
		Model:  "kmodel",
		Prompt: "fallback prompt",
		Messages: []Message{
			{Role: "user", Content: "查看项目"},
			{Role: "assistant", ToolCalls: []toolemulation.ToolCall{{
				ID:        "call_1",
				Name:      "Bash",
				Arguments: map[string]any{"command": "pwd && ls -la"},
			}}},
			{Role: "tool", ToolCallID: "call_1", Content: "total 10"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		t.Fatal(err)
	}
	messages := payload["messages"].([]any)
	if len(messages) != 3 {
		t.Fatalf("messages = %#v", messages)
	}
	assistant := messages[1].(map[string]any)
	calls := assistant["tool_calls"].([]any)
	call := calls[0].(map[string]any)
	fn := call["function"].(map[string]any)
	args := fn["arguments"].(string)
	if assistant["role"] != "assistant" || fn["name"] != "Bash" || !strings.Contains(args, "pwd") || !strings.Contains(args, "ls -la") {
		t.Fatalf("unexpected assistant message: %#v", assistant)
	}
	tool := messages[2].(map[string]any)
	if tool["role"] != "tool" || tool["tool_call_id"] != "call_1" || tool["content"] != "total 10" {
		t.Fatalf("unexpected tool message: %#v", tool)
	}
}

func TestBuildBodyProjectsRemoteImages(t *testing.T) {
	client := New(Config{})
	body, err := client.buildBody("req-1", ChatRequest{
		Model:  "kmodel",
		Prompt: "看图",
		Messages: []Message{{
			Role:    "user",
			Content: "看图",
			Images: []Image{{
				MediaType: "image/png",
				Data:      "iVBORw0KGgo=",
			}},
		}},
		Images: []Image{{
			MediaType: "image/png",
			Data:      "iVBORw0KGgo=",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		t.Fatal(err)
	}
	messages := payload["messages"].([]any)
	message := messages[0].(map[string]any)
	content := message["content"].([]any)
	if content[0].(map[string]any)["type"] != "text" || content[1].(map[string]any)["type"] != "image_url" {
		t.Fatalf("unexpected message content: %#v", content)
	}
	imageURL := content[1].(map[string]any)["image_url"].(map[string]any)
	if !strings.HasPrefix(imageURL["url"].(string), "data:image/png;base64,") {
		t.Fatalf("unexpected image url: %#v", imageURL)
	}
}

func TestParseSSEPayloadExtractsNativeToolCallFragments(t *testing.T) {
	payload := `{"body":"{\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"file_path\\\":\\\"/tmp/a.txt\\\"}\"}}]}}]}","statusCodeValue":200}`
	event, ok, err := parseSSEPayload(payload)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("event not parsed")
	}
	if len(event.ToolCalls) != 1 {
		t.Fatalf("tool calls = %#v", event.ToolCalls)
	}
	call := event.ToolCalls[0]
	if call.ID != "call_1" || call.Name != "read_file" || call.ArgumentsFragment != `{"file_path":"/tmp/a.txt"}` {
		t.Fatalf("unexpected call = %#v", call)
	}
}

func TestParseSSEPayloadIncludesBodyOnStatusError(t *testing.T) {
	payload := `{"body":"{\"message\":\"invalid request body\"}","statusCodeValue":400}`
	_, _, err := parseSSEPayload(payload)
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "remote sse status 400") || !strings.Contains(err.Error(), "invalid request body") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseSSEPayloadAcceptsRawOpenAIChunk(t *testing.T) {
	payload := `{"choices":[{"delta":{"content":"hello"}}]}`
	event, ok, err := parseSSEPayload(payload)
	if err != nil {
		t.Fatal(err)
	}
	if !ok || event.Content != "hello" {
		t.Fatalf("event = %#v ok=%v", event, ok)
	}
}

func TestRemoteToolCallBufferMergesArgumentFragments(t *testing.T) {
	buffer := newRemoteToolCallBuffer()
	buffer.Add([]remoteToolCallFragment{{
		Index: 0,
		ID:    "call_1",
		Type:  "function",
		Name:  "read_file",
	}})
	buffer.Add([]remoteToolCallFragment{{Index: 0, ArgumentsFragment: `{"file_path":"/tmp`}})
	buffer.Add([]remoteToolCallFragment{{Index: 0, ArgumentsFragment: `/lingma-native`}})
	buffer.Add([]remoteToolCallFragment{{Index: 0, ArgumentsFragment: `-tool-test.txt"}`}})
	calls := buffer.Calls()
	if len(calls) != 1 {
		t.Fatalf("calls = %#v", calls)
	}
	call := calls[0]
	if call.ID != "call_1" || call.Name != "read_file" || call.Arguments["file_path"] != "/tmp/lingma-native-tool-test.txt" {
		t.Fatalf("unexpected merged call = %#v", call)
	}
}

func TestRemoteToolCallBufferParsesNestedJSONArgumentStrings(t *testing.T) {
	buffer := newRemoteToolCallBuffer()
	buffer.Add([]remoteToolCallFragment{{
		Index:             0,
		ID:                "call_1",
		Type:              "function",
		Name:              "question",
		ArgumentsFragment: `{"questions":"[{\"question\":\"X\",\"options\":[\"a\",\"b\",\"c\"],\"required\":true}]"}`,
	}})

	calls := buffer.Calls()
	if len(calls) != 1 {
		t.Fatalf("calls = %#v", calls)
	}
	questions, ok := calls[0].Arguments["questions"].([]any)
	if !ok || len(questions) != 1 {
		t.Fatalf("questions = %#v, want native array", calls[0].Arguments["questions"])
	}
	first := questions[0].(map[string]any)
	if first["question"] != "X" || first["required"] != true {
		t.Fatalf("unexpected question = %#v", first)
	}
}

func TestExtractMachineIDFromTextMarkers(t *testing.T) {
	got := extractMachineIDFromText(`2026-05-06 info using machine id from file: abcdef1234567890abcdef`)
	if got != "abcdef1234567890abcdef" {
		t.Fatalf("machine id = %q", got)
	}
}

func TestExtractMachineIDFromTextJSON(t *testing.T) {
	got := extractMachineIDFromText(`{"machineId":"windows-machine-id-1234567890","other":true}`)
	if got != "windows-machine-id-1234567890" {
		t.Fatalf("machine id = %q", got)
	}
}

func TestCandidateLingmaCacheDirsIncludesVSCodeSharedClientCache(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("LINGMA_CACHE_DIR", "")
	dirs := candidateLingmaCacheDirs()
	want := filepath.Join(home, ".lingma", "vscode", "sharedClientCache")
	for _, dir := range dirs {
		if dir == want {
			return
		}
	}
	t.Fatalf("missing vscode shared client cache %q in %#v", want, dirs)
}

func TestLoadMachineIDReadsVSCodeSharedClientCacheID(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "cache"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "cache", "id"), []byte("abcdefghijklmnop1234"), 0644); err != nil {
		t.Fatal(err)
	}
	got, err := loadMachineID(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got != "abcdefghijklmnop1234" {
		t.Fatalf("machine id = %q", got)
	}
}

func TestLoadCredentialsReadsAccountBundle(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lingma-accounts.json")
	body := `{
		"accounts":[{
			"source":"first",
			"token_expire_time":"4102444800000",
			"auth":{"cosy_key":"key-1","encrypt_user_info":"info-1","user_id":"user-1","machine_id":"machine-1"}
		},{
			"source":"second",
			"auth":{"cosy_key":"key-2","encrypt_user_info":"info-2","user_id":"user-2","machine_id":"machine-2"}
		}]
	}`
	if err := os.WriteFile(path, []byte(body), 0644); err != nil {
		t.Fatal(err)
	}
	creds, err := LoadCredentials(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(creds) != 2 || creds[0].UserID != "user-1" || creds[1].CosyKey != "key-2" {
		t.Fatalf("credentials = %#v", creds)
	}
}

func TestLoadCredentialsReadsEnvLists(t *testing.T) {
	t.Setenv("LINGMA_COSY_USER", "user-1,user-2")
	t.Setenv("LINGMA_COSY_KEY", "key-1,key-2")
	t.Setenv("LINGMA_AUTH_INFO", "info-1,info-2")
	t.Setenv("LINGMA_MACHINE_ID", "machine-1,machine-2")

	creds, err := LoadCredentials("")
	if err != nil {
		t.Fatal(err)
	}
	if len(creds) != 2 || creds[0].MachineID != "machine-1" || creds[1].EncryptUserInfo != "info-2" {
		t.Fatalf("credentials = %#v", creds)
	}
}
