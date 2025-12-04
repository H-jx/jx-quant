
package common

// AverageQueue calculates the average of values in a circular queue.
type AverageQueue struct {
	queue *CircularQueue
}

// NewAverageQueue creates a new AverageQueue.
func NewAverageQueue(maxSize int) *AverageQueue {
	return &AverageQueue{
		queue: NewCircularQueue(maxSize),
	}
}

// Push adds a value to the queue.
func (aq *AverageQueue) Push(value float64) {
	aq.queue.Push(value)
}

// Calc calculates the average of the values in the queue.
func (aq *AverageQueue) Calc() float64 {
	sum := 0.0
	size := aq.queue.Size()
	if size == 0 {
		return 0
	}
	for i := 0; i < size; i++ {
		sum += aq.queue.Get(i).(float64)
	}
	return sum / float64(size)
}
