package toolargs

import "testing"

func TestNormalizeJSONStringsParsesNestedObjectAndArrayStrings(t *testing.T) {
	got := NormalizeJSONStrings(map[string]any{
		"questions": `[{"question":"X","options":["a","b","c"],"required":true}]`,
		"config":    `{"limit":2,"filters":["new"]}`,
		"plain":     "keep me",
	})

	questions, ok := got["questions"].([]any)
	if !ok || len(questions) != 1 {
		t.Fatalf("questions = %#v, want array with one item", got["questions"])
	}
	first := questions[0].(map[string]any)
	if first["question"] != "X" || first["required"] != true {
		t.Fatalf("unexpected question = %#v", first)
	}
	options, ok := first["options"].([]any)
	if !ok || len(options) != 3 || options[0] != "a" {
		t.Fatalf("options = %#v", first["options"])
	}

	config, ok := got["config"].(map[string]any)
	if !ok || config["limit"] != float64(2) {
		t.Fatalf("config = %#v", got["config"])
	}
	if got["plain"] != "keep me" {
		t.Fatalf("plain = %#v", got["plain"])
	}
}

func TestNormalizeJSONStringsRecursesIntoParsedJSONStrings(t *testing.T) {
	got := NormalizeJSONStrings(map[string]any{
		"outer": `{"inner":"[{\"id\":\"a\"}]"}`,
	})

	outer := got["outer"].(map[string]any)
	inner, ok := outer["inner"].([]any)
	if !ok || len(inner) != 1 {
		t.Fatalf("inner = %#v, want parsed array", outer["inner"])
	}
	item := inner[0].(map[string]any)
	if item["id"] != "a" {
		t.Fatalf("item = %#v", item)
	}
}

func TestNormalizeJSONStringsKeepsInvalidAndScalarStrings(t *testing.T) {
	got := NormalizeJSONStrings(map[string]any{
		"bad":    `[{"missing":]`,
		"number": "123",
		"bool":   "true",
	})

	if got["bad"] != `[{"missing":]` || got["number"] != "123" || got["bool"] != "true" {
		t.Fatalf("unexpected normalized values = %#v", got)
	}
}
