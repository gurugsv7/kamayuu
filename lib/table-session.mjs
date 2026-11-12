// A table owns both its transport callbacks and its pending presentations.
// Clearing a Promise reference alone does not cancel callbacks already chained
// onto it. Invalidate those callbacks before returning home or opening a table.
export class TableSession {
  generation = 0;
  presentation = 0;
  tail = Promise.resolve();

  clearQueue() {
    this.presentation++;
    this.tail = Promise.resolve();
  }

  reset() {
    this.generation++;
    this.clearQueue();
  }

  guard(callback) {
    const generation = this.generation;
    return (...args) => {
      if (generation === this.generation) return callback(...args);
    };
  }

  enqueue(present) {
    const presentation = this.presentation;
    this.tail = this.tail.then(() => {
      if (presentation === this.presentation) return present();
    }).catch(() => {});
    return this.tail;
  }
}
