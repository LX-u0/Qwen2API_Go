package storage

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"qwen2api/internal/config"
)

func isRedisMode(cfg config.Config) bool {
	return strings.EqualFold(strings.TrimSpace(cfg.DataSaveMode), "redis")
}

func redisURLFromConfig(cfg config.Config) (string, error) {
	if !isRedisMode(cfg) {
		return "", nil
	}
	redisURL := strings.TrimSpace(cfg.RedisURL)
	if redisURL == "" {
		return "", errors.New("DATA_SAVE_MODE=redis 时必须提供 REDIS_URL")
	}
	return redisURL, nil
}

func newRedisClient(redisURL string) (*redis.Client, error) {
	opts, err := parseRedisOptions(redisURL)
	if err != nil {
		return nil, fmt.Errorf("解析 REDIS_URL 失败: %w", err)
	}
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), redisPingTimeout(opts))
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("连接 Redis 失败 addr=%s db=%d: %w", opts.Addr, opts.DB, err)
	}
	return client, nil
}

func redisPingTimeout(opts *redis.Options) time.Duration {
	timeout := opts.DialTimeout + opts.WriteTimeout + opts.ReadTimeout
	if timeout <= 0 {
		return 20 * time.Second
	}
	return timeout
}

func parseRedisOptions(raw string) (*redis.Options, error) {
	normalized := normalizeRedisURL(raw)
	opts, err := redis.ParseURL(normalized)
	if err != nil {
		return nil, err
	}
	applyRedisDefaults(opts, normalized)
	return opts, nil
}

func normalizeRedisURL(raw string) string {
	redisURL := strings.TrimSpace(raw)
	if strings.Contains(redisURL, "://") {
		return redisURL
	}
	return "redis://" + redisURL
}

func applyRedisDefaults(opts *redis.Options, redisURL string) {
	parsed, err := url.Parse(redisURL)
	if err != nil {
		return
	}
	query := parsed.Query()
	if _, ok := query["max_retries"]; !ok {
		opts.MaxRetries = 3
	}
	if _, ok := query["min_retry_backoff"]; !ok {
		opts.MinRetryBackoff = 200 * time.Millisecond
	}
	if _, ok := query["max_retry_backoff"]; !ok {
		opts.MaxRetryBackoff = 3 * time.Second
	}
	if _, ok := query["dial_timeout"]; !ok {
		opts.DialTimeout = 10 * time.Second
	}
	if _, ok := query["read_timeout"]; !ok {
		opts.ReadTimeout = 15 * time.Second
	}
	if _, ok := query["write_timeout"]; !ok {
		opts.WriteTimeout = 15 * time.Second
	}
	if _, ok := query["conn_max_idle_time"]; !ok {
		opts.ConnMaxIdleTime = 45 * time.Second
	}
}

func redisContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 20*time.Second)
}
