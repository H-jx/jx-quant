package common

// CircularQueue is a simple generic ring buffer with fixed capacity.
// It avoids allocations on push by reusing the underlying slice.
type CircularQueue[T any] struct {
	buf    []T
	start  int
	length int
	cap    int
}

func NewCircularQueue[T any](capacity int) *CircularQueue[T] {
	if capacity <= 0 {
		capacity = 1
	}
	return &CircularQueue[T]{
		buf: make([]T, capacity),
		cap: capacity,
	}
}

func (q *CircularQueue[T]) Push(v T) {
	if q.length < q.cap {
		idx := (q.start + q.length) % q.cap
		q.buf[idx] = v
		q.length++
		return
	}
	// overwrite oldest
	q.buf[q.start] = v
	q.start = (q.start + 1) % q.cap
}

func (q *CircularQueue[T]) Update(index int, v T) {
	if index < 0 || index >= q.length {
		return
	}
	idx := (q.start + index) % q.cap
	q.buf[idx] = v
}

func (q *CircularQueue[T]) Get(index int) (T, bool) {
	var zero T
	if index < 0 || index >= q.length {
		return zero, false
	}
	return q.buf[(q.start+index)%q.cap], true
}

func (q *CircularQueue[T]) Size() int { return q.length }

func (q *CircularQueue[T]) Clear() {
	q.start = 0
	q.length = 0
}

func (q *CircularQueue[T]) ToSlice() []T {
	out := make([]T, q.length)
	for i := 0; i < q.length; i++ {
		out[i] = q.buf[(q.start+i)%q.cap]
	}
	return out
}
