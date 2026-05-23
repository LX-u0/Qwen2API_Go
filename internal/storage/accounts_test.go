package storage

import (
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"qwen2api/internal/config"
)

func TestFileAndRedisStoresHaveConsistentSemantics(t *testing.T) {
	file := &fileStore{path: filepath.Join(t.TempDir(), "data.json")}

	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis.Run() error = %v", err)
	}
	defer mr.Close()

	redisStore := &redisStore{
		client: redis.NewClient(&redis.Options{Addr: mr.Addr()}),
	}

	stores := map[string]AccountStore{
		"file":  file,
		"redis": redisStore,
	}

	initial := []Account{
		{Email: "a@example.com", Password: "p1", Token: "t1", Expires: 1710000000},
		{Email: "b@example.com", Password: "p2", Token: "t2", Expires: 1720000000},
	}
	updated := Account{Email: "a@example.com", Password: "p1x", Token: "t1x", Expires: 1730000000}

	for name, store := range stores {
		t.Run(name, func(t *testing.T) {
			if err := store.SaveAllAccounts(initial); err != nil {
				t.Fatalf("SaveAllAccounts() error = %v", err)
			}

			got, err := store.LoadAccounts()
			if err != nil {
				t.Fatalf("LoadAccounts() error = %v", err)
			}
			assertAccountsEqual(t, got, initial)

			if err := store.SaveAccount(updated); err != nil {
				t.Fatalf("SaveAccount() error = %v", err)
			}
			got, err = store.LoadAccounts()
			if err != nil {
				t.Fatalf("LoadAccounts() error = %v", err)
			}
			assertAccountsEqual(t, got, []Account{
				updated,
				initial[1],
			})

			if err := store.DeleteAccount("b@example.com"); err != nil {
				t.Fatalf("DeleteAccount() error = %v", err)
			}
			got, err = store.LoadAccounts()
			if err != nil {
				t.Fatalf("LoadAccounts() error = %v", err)
			}
			assertAccountsEqual(t, got, []Account{updated})

			if err := store.SaveAllAccounts(nil); err != nil {
				t.Fatalf("SaveAllAccounts(nil) error = %v", err)
			}
			got, err = store.LoadAccounts()
			if err != nil {
				t.Fatalf("LoadAccounts() error = %v", err)
			}
			if len(got) != 0 {
				t.Fatalf("expected empty accounts after overwrite, got %#v", got)
			}
		})
	}
}

func TestRedisConstructorsAcceptBareAddress(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis.Run() error = %v", err)
	}
	defer mr.Close()

	cfg := config.Config{
		DataSaveMode: "redis",
		RedisURL:     mr.Addr(),
	}

	if _, err := NewAccountStore(cfg); err != nil {
		t.Fatalf("NewAccountStore() error = %v", err)
	}
	if _, err := NewConversationStore(cfg); err != nil {
		t.Fatalf("NewConversationStore() error = %v", err)
	}
	if _, err := NewChatTracker(cfg); err != nil {
		t.Fatalf("NewChatTracker() error = %v", err)
	}
}

func TestChatTrackerDoesNotUseRedisOutsideRedisMode(t *testing.T) {
	cfg := config.Config{
		DataSaveMode: "file",
		RedisURL:     "127.0.0.1:0",
	}

	tracker, err := NewChatTracker(cfg)
	if err != nil {
		t.Fatalf("NewChatTracker() error = %v", err)
	}
	if _, ok := tracker.(*memoryChatTracker); !ok {
		t.Fatalf("NewChatTracker() = %T, want *memoryChatTracker", tracker)
	}
}

func TestParseRedisOptionsNormalizesURLAndPreservesQuery(t *testing.T) {
	opts, err := parseRedisOptions("localhost:6380/2?read_timeout=1s&max_retries=0")
	if err != nil {
		t.Fatalf("parseRedisOptions() error = %v", err)
	}
	if opts.Addr != "localhost:6380" {
		t.Fatalf("Addr = %q, want localhost:6380", opts.Addr)
	}
	if opts.DB != 2 {
		t.Fatalf("DB = %d, want 2", opts.DB)
	}
	if opts.ReadTimeout != time.Second {
		t.Fatalf("ReadTimeout = %s, want 1s", opts.ReadTimeout)
	}
	if opts.MaxRetries != 0 {
		t.Fatalf("MaxRetries = %d, want 0", opts.MaxRetries)
	}
	if got, want := redisPingTimeout(opts), 26*time.Second; got != want {
		t.Fatalf("redisPingTimeout() = %s, want %s", got, want)
	}
}

func assertAccountsEqual(t *testing.T, got, want []Account) {
	t.Helper()
	gotCopy := append([]Account(nil), got...)
	wantCopy := append([]Account(nil), want...)
	slices.SortFunc(gotCopy, func(a, b Account) int {
		switch {
		case a.Email < b.Email:
			return -1
		case a.Email > b.Email:
			return 1
		default:
			return 0
		}
	})
	slices.SortFunc(wantCopy, func(a, b Account) int {
		switch {
		case a.Email < b.Email:
			return -1
		case a.Email > b.Email:
			return 1
		default:
			return 0
		}
	})
	if len(gotCopy) != len(wantCopy) {
		t.Fatalf("account len = %d, want %d", len(gotCopy), len(wantCopy))
	}
	for i := range wantCopy {
		if gotCopy[i] != wantCopy[i] {
			t.Fatalf("account[%d] = %#v, want %#v", i, gotCopy[i], wantCopy[i])
		}
	}
}
