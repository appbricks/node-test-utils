import { Store } from 'redux';
import { Logger, execAfter } from '@appbricks/utils';

export default class StateTester<T> {

  counter = 0;
  testErr?: any;

  testFn: (counter: number, state: T) => void;

  logger: Logger;

  constructor(testFn: (counter: number, state: T) => void) {
    this.testFn = testFn;
    this.testErr = undefined;

    this.logger = new Logger('StateTester');
  }

  tester(store: Store): () => void {

    return () => {
      this.counter++;
      const state = <T>store.getState().auth;

      try {        
        this.testFn(this.counter, state);
        this.logger.debug(`State change test iteration ${this.counter} passed.`);
      } catch (err) {
        console.error(`State change test iteration ${this.counter} failed:`, err);
        this.logger.debug('State with error:', state);
        this.testErr = err;
      }
    }
  }

  isOk() {
    if (this.testErr) {
      fail(this.testErr);
    }
  }

  async until(counterAt: number): Promise<void> {
    const checkCounter = this.checkCounter.bind(this);
    let timer = execAfter(() => this.counter < counterAt, 100, true);
    await timer.promise;
  }

  private checkCounter(counterAt: number): boolean {
    return (this.counter >= counterAt);
  }
}
