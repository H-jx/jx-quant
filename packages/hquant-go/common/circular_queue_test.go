package common_test

import (
	"testing"

	"github.com/yourname/hquant-go/common"
)

func TestCircularQueueBasic(t *testing.T) {
	q := common.NewCircularQueue[int](6)
	for i := 0; i < 5; i++ {
		q.Push(i)
	}
	if q.ToSlice()[0] != 0 {
		t.Fatalf("expected front 0 got %v", q.ToSlice()[0])
	}
	if q.ToSlice()[len(q.ToSlice())-1] != 4 {
		t.Fatalf("expected last 4")
	}
}

func TestCircularQueueWrap(t *testing.T) {
	q := common.NewCircularQueue[int](10)
	for i := 0; i < 21; i++ {
		q.Push(i)
	}
	s := q.ToSlice()
	if len(s) != 10 || s[0] != 11 || s[9] != 20 {
		t.Fatalf("unexpected slice: %v", s)
	}
}
