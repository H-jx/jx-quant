
package common

import "sync"

// TypedRingBuffer is a circular buffer for float64 values.
type TypedRingBuffer struct {
	data    []float64
	maxSize int
	front   int
	rear    int
	length  int
	mutex   sync.RWMutex
}

// NewTypedRingBuffer creates a new TypedRingBuffer.
func NewTypedRingBuffer(maxSize int) *TypedRingBuffer {
	return &TypedRingBuffer{
		data:    make([]float64, maxSize),
		maxSize: maxSize,
	}
}

// Push adds a value to the buffer.
func (t *TypedRingBuffer) Push(value float64) {
	t.mutex.Lock()
	defer t.mutex.Unlock()

	if t.length == t.maxSize {
		t.front = (t.front + 1) % t.maxSize
		t.length--
	}
	t.data[t.rear] = value
	t.rear = (t.rear + 1) % t.maxSize
	t.length++
}

// Get returns a value at a specific index.
func (t *TypedRingBuffer) Get(index int) float64 {
	t.mutex.RLock()
	defer t.mutex.RUnlock()

	if index < 0 {
		index = t.length + index
	}

	if index < 0 || index >= t.length {
		return 0 // Or handle error appropriately
	}

	i := (t.front + index) % t.maxSize
	return t.data[i]
}

// Update updates a value at a specific index.
func (t *TypedRingBuffer) Update(index int, value float64) {
	t.mutex.Lock()
	defer t.mutex.Unlock()

	if index < 0 {
		index = t.length + index
	}

	if index < 0 || index >= t.length {
		return // Or handle error appropriately
	}

	i := (t.front + index) % t.maxSize
	t.data[i] = value
}

// Size returns the number of items in the buffer.
func (t *TypedRingBuffer) Size() int {
	t.mutex.RLock()
	defer t.mutex.RUnlock()
	return t.length
}

func (t *TypedRingBuffer) Clear() {
	t.mutex.Lock()
	defer t.mutex.Unlock()
	t.data = make([]float64, t.maxSize)
	t.front = 0
	t.rear = 0
	t.length = 0
}

// ToArray returns the buffer as a slice.
func (t *TypedRingBuffer) ToArray() []float64 {
	t.mutex.RLock()
	defer t.mutex.RUnlock()

	result := make([]float64, t.length)
	for i := 0; i < t.length; i++ {
		result[i] = t.Get(i)
	}
	return result
}
