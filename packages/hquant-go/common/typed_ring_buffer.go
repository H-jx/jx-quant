package common

// FloatRingBuffer is a fixed-size ring buffer for float64 values optimized to minimize allocations.
type FloatRingBuffer struct {
	buf   []float64
	cap   int
	len   int
	start int
}

func NewFloatRingBuffer(capacity int) *FloatRingBuffer {
	if capacity <= 0 {
		capacity = 1
	}
	return &FloatRingBuffer{buf: make([]float64, capacity), cap: capacity}
}

func (r *FloatRingBuffer) Push(v float64) {
	if r.len < r.cap {
		r.buf[(r.start+r.len)%r.cap] = v
		r.len++
		return
	}
	r.buf[r.start] = v
	r.start = (r.start + 1) % r.cap
}

func (r *FloatRingBuffer) UpdateLast(v float64) {
	if r.len == 0 {
		return
	}
	idx := (r.start + r.len - 1) % r.cap
	r.buf[idx] = v
}

func (r *FloatRingBuffer) Get(i int) (float64, bool) {
	if i < 0 || i >= r.len {
		return 0, false
	}
	return r.buf[(r.start+i)%r.cap], true
}

func (r *FloatRingBuffer) Len() int { return r.len }
