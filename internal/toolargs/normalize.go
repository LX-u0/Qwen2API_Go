package toolargs

import (
	"encoding/json"
	"strings"
)

func NormalizeJSONStrings(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	out := make(map[string]any, len(input))
	for key, value := range input {
		out[key] = normalizeValue(value)
	}
	return out
}

func normalizeValue(value any) any {
	switch v := value.(type) {
	case map[string]any:
		return NormalizeJSONStrings(v)
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = normalizeValue(item)
		}
		return out
	case string:
		if parsed, ok := parseJSONObjectOrArrayString(v); ok {
			return normalizeValue(parsed)
		}
		return v
	default:
		return v
	}
}

func parseJSONObjectOrArrayString(value string) (any, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, false
	}
	if !strings.HasPrefix(trimmed, "{") && !strings.HasPrefix(trimmed, "[") {
		return nil, false
	}
	var parsed any
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return nil, false
	}
	switch parsed.(type) {
	case map[string]any, []any:
		return parsed, true
	default:
		return nil, false
	}
}
