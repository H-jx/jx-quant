package common_test

import (
	"testing"

	"github.com/yourname/hquant-go/common"
)

func TestFloatRingBufferPushGet(t *testing.T) {
	b := common.NewFloatRingBuffer(3)
	b.Push(1.1)
	b.Push(2.2)
	b.Push(3.3)
	if v, _ := b.Get(0); v != 1.1 {
		t.Fatalf("expected 1.1 got %v", v)
	}
	if v, _ := b.Get(2); v != 3.3 {
		t.Fatalf("expected 3.3 got %v", v)
	}
}

func TestFloatRingBufferOverwrite(t *testing.T) {
	b := common.NewFloatRingBuffer(2)
	b.Push(1)
	b.Push(2)
	b.Push(3)
	if b.Len() != 2 {
		t.Fatalf("expected len 2 got %d", b.Len())
	}
	if v, _ := b.Get(0); v != 2 {
		t.Fatalf("expected 2 got %v", v)
	}
}
