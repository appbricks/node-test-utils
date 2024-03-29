import {
  Logger,
  execAfter,
  State,
  ActionResult,
  getLastStatus,
  ActionStatus
} from '@appbricks/utils';

export default class StateTester<S extends State = any> {

  private logger: Logger;

  counter = 0;

  private expectStates: StateTest<S>[];
  private hasErrors: boolean = false;

  constructor(logger: Logger) {
    this.logger = logger;
    this.expectStates = [];
  }

  expectState(numStateChangesToSkip: number, state?: S, test?: ExpectTest<S>) {
    this.expectStates.push(
      <StateTest>{ 
        counter: numStateChangesToSkip - 1, 
        state,
        test
      }
    );
  }

  expectStateTest(
    lastActionType: string,
    lastStatusResult?: ActionResult,
    test?: ExpectTest<S>
  ) {
    this.expectStates.push(
      <StateTest>{ 
        lastActionType,
        lastStatusResult,
        test
      }
    );
  }

  test(getState: () => S): () => void {
    const tester = this;

    return () => {
      this.counter++;

      const state = getState();
      this.logger.trace(`State change test iteration ${this.counter}:`, state);

      if (tester.expectStates.length > 0 && 
        tester.expectStates[0].counter &&
        tester.expectStates[0].counter > 0) {
        
        this.logger.trace(`Skipping test iteration ${this.counter} until iteration ${tester.expectStates[0].counter + this.counter}...`)
        tester.expectStates[0].counter--;
        return;
      }

      let stateTest: StateTest<S> | undefined;
      try {
        stateTest = tester.expectStates.shift();
        if (!!!stateTest) {
          throw new Error(`Encountered state changes greater than the expected number of state changes at iteration ${tester.counter}.`);
        }

        this.logger.trace(`Expected action for state change ${this.counter}:`, stateTest.lastActionType, stateTest.lastStatusResult);
        if (stateTest.counter) {
          expect(tester.counter).toEqual(stateTest.counter);
        }
        if (stateTest.state) {
          expect(tester.expectState).toEqual(state);
        }

        const status = getLastStatus(state);
        if (stateTest.lastActionType) {  
          expect(status).toBeDefined();        
          expect(status.actionType).toEqual(stateTest.lastActionType);
          expect(status.result).toEqual(stateTest.lastStatusResult);
        }
        if (stateTest.test) {
          stateTest.test(this.counter, state, status);
        }

      } catch (err) {
        tester.logger.error(
          `State change test iteration ${this.counter} failed at state:`, state);
        if (!!stateTest) {
          tester.logger.error(
            `Expected action for state change @ test iteration ${this.counter}:`, 
            stateTest);
          tester.logger.error(
            `Remaining expected action stack @ test iteration ${this.counter}:`, 
            this.expectStates);
        }
        tester.logger.error('State change test failed with', err);
        this.hasErrors = true;
      }
    }
  }

  // wait until all the state tests
  // have been processed (counted)
  async done(): Promise<void> {
    const tester = this;

    let timer = execAfter(
      () => {
        if (tester.hasErrors) {
          throw('Expected state change stream tests failed. See errors above...');
        }
        return tester.expectStates.length > 0;
      }, 
      100, true
    );
    await timer.promise;
  }
}

export interface StateTest<S extends State = any> {

  counter?: number
  state?: S

  lastActionType?: string
  lastStatusResult?: ActionResult

  test?: ExpectTest<S>
}

type ExpectTest<S> = (
  counter: number, 
  state: S,
  status: ActionStatus
) => void;
