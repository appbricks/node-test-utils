import { Reducer } from 'redux';
import { 
  Logger, 
  execAfter,
  ERROR, 
  Action, 
  ErrorPayload,
} from '@appbricks/utils';
import { throws } from 'assert';

export default class ActionTester<T1 = any, T2 = T1, S = any> {

  private logger: Logger;

  counter: number = 0;
  actionCounter: number = 0;
  okCounter: number = 0;
  errorCounter: number = 0;

  private initialState: S | any;

  private matchRelatedAction: boolean;

  private actionType: string;
  private okActionType: string;

  private actionValidator: ActionValidator<S, T1>;
  private okActionValidator: ActionValidator<S, T2>;
  private errorActionValidator: ActionValidator<S, ErrorPayload>;

  private expectActions: Action[];
  private expectOkActions: Action[];
  private expectErrorActions: Action[];

  hasErrors: boolean;

  constructor(
    logger: Logger,
    actionType: string,
    okActionType: string,
    actionValidator = nullValidator,
    okActionValidator = nullValidator,
    errorActionValidator = nullValidator,
    initialState = {},
    matchRelatedAction = true
  ) {
    this.logger = logger;

    this.initialState = initialState;
    this.actionType = actionType;
    this.okActionType = okActionType;

    this.actionValidator = actionValidator;
    this.okActionValidator = okActionValidator;
    this.errorActionValidator = errorActionValidator;

    this.matchRelatedAction = matchRelatedAction;

    this.expectActions = [];
    this.expectOkActions = [];
    this.expectErrorActions = [];

    this.hasErrors = false;
  }

  expectAction(action: Action) {
    this.expectActions.push(action);
  }

  expectOkAction(action: Action) {
    this.expectOkActions.push(action);
  }
  expectErrorAction(action: Action) {
    this.expectErrorActions.push(action);
  }

  // wait until all the test events 
  // have been processed (counted)
  async done(): Promise<void> {
    const tester = this;
    let timer = execAfter(
      () => {
        return this.expectActions.length > 0 ||
          this.expectOkActions.length > 0 ||
          this.expectErrorActions.length > 0;
      },
      100, true
    );
    await timer.promise;
  }

  reducer(): Reducer<S | any, Action<T1 | ErrorPayload>> {
    const tester = this;

    return (state: S | any = this.initialState, action: Action): S | any => {
      tester.logger.trace('Reducer called with action', action.type);
      tester.counter++;

      try {
        switch (action.type) {

          case tester.actionType: {
            tester.actionCounter++;
            expect(action.meta.relatedAction).toBeUndefined();
            
            const expectAction = this.expectActions.shift();
            expect(expectAction).toBeDefined();
            expect(action.payload).toEqual(expectAction!.payload);

            return tester.actionValidator(tester.actionCounter, state, <Action<T1>>action);
          }
          case tester.okActionType: {
            tester.okCounter++;
            expect(action.meta.relatedAction).toBeDefined();
            if (this.matchRelatedAction) {
              expect(action.meta.relatedAction!.type).toEqual(tester.actionType);
            }
            
            const expectAction = this.expectOkActions.shift();
            expect(expectAction).toBeDefined();
            expect(action.payload).toEqual(expectAction!.payload);

            return tester.okActionValidator(tester.okCounter, state, <Action<T2>>action);
          }
          case ERROR: {
            tester.errorCounter++;
            expect(action.payload).toBeDefined();
            expect(action.meta.relatedAction).toBeDefined();
            if (this.matchRelatedAction) {
              expect(action.meta.relatedAction!.type).toEqual(tester.actionType);
            }
            
            const expectAction = this.expectErrorActions.shift();
            expect(expectAction).toBeDefined();
            expect(action.payload).toEqual(expectAction!.payload);

            return tester.errorActionValidator(tester.errorCounter, state, <Action<ErrorPayload>>action);
          }
        }

      } catch (err) {
        tester.logger.error('Test reducer failed with', err);
        tester.hasErrors = true;
      }
      return state;
    }
  }
}

type ActionValidator<S = any, T = any> = (
  counter: number,
  state: S | any,
  action: Action<T>
) => S | any;

const nullValidator: ActionValidator = (counter, state, action): any => {
  return state;
}
