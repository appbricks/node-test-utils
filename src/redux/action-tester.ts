import { Reducer } from 'redux';
import {
  Logger,
  execAfter,
  SUCCESS,
  ERROR,
  Action,
  ErrorPayload,
} from '@appbricks/utils';

export default class ActionTester<S = any> {

  private logger: Logger;

  counter: number = 0;
  actionCounter: number = 0;
  successCounter: number = 0;
  errorCounter: number = 0;

  private initialState: S | any;;
  private expectActions: ActionLink<S>[];

  hasErrors: boolean;

  constructor(
    logger: Logger,
    initialState = {}
  ) {
    this.logger = logger;

    this.initialState = initialState;
    this.expectActions = [];
    this.hasErrors = false;
  }

  expectAction<P>(
    type: string,
    payload?: P,
    actionValidator = nullValidator
  ): ActionLink<S> {
    const link = new ActionLink(
      <Action<P>>{
        type,
        payload,
        meta: {
          timestamp: Date.now()
        }
      },
      actionValidator
    );
    this.expectActions.push(link);
    return link;
  }

  // wait until all the test events
  // have been processed (counted)
  async done(): Promise<void> {
    const tester = this;
    let timer = execAfter(
      () => !this.hasErrors && this.expectActions.length > 0,
      100, true
    );
    await timer.promise;
  }

  reducer(): Reducer<S, Action> {
    const tester = this;

    return (state: S = this.initialState, action: Action): S => {
      tester.logger.trace('Reducer called with action', action.type);
      tester.counter++;

      let link: ActionLink<S> | undefined = undefined;
      for (let i = 0; i < tester.expectActions.length; i++) {
        const [ l ] = tester.expectActions[i].find(
          action.type,
          action.meta.relatedAction && action.meta.relatedAction.type
        )
        if (l) {
          link = l;
          break;
        }
      }
      if (!link) {
        return state;
      }
      link.seen = true;
      const expectAction = link.action;

      try {
        expect(expectAction).toBeDefined();
        expect(action.type).toEqual(expectAction.type);
        if (link.actionValidator == nullValidator) {
          expect(action.payload).toEqual(expectAction.payload);
        }

        switch (action.type) {

          case SUCCESS: {
            tester.successCounter++;
            expect(action.meta.relatedAction).toBeDefined();

            state = link.actionValidator(tester.successCounter, state, action);
            break;
          }
          case ERROR: {
            tester.errorCounter++;
            expect(action.payload).toBeDefined();
            expect(action.meta.relatedAction).toBeDefined();

            state = link.actionValidator(tester.errorCounter, state, action);
            break;
          }
          default: {
            tester.actionCounter++;
            state = link.actionValidator(tester.actionCounter, state, action);
          }
        }

        // prune expect actions that
        // have been validated by the
        // action stream
        this.expectActions.forEach((link, index) => {
          if (link.prune()) {
            this.expectActions.splice(index, 1);
          }
        });

        return state;

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

class ActionLink<S> {

  seen: boolean
  action: Action
  actionValidator: ActionValidator;

  private links: ActionLink<S>[]

  constructor(
    action: Action,
    actionValidator = nullValidator,
  ) {
    this.seen = false;
    this.action = action;
    this.actionValidator = actionValidator;
    this.links = [];
  }

  find(
    actionType: string,
    metaActionType?: string
  ): [ ActionLink<S> | undefined, boolean ] {
    if (this.seen) {
      // if this action has been seen
      // and tested search its links
      for (let i = 0; i < this.links.length; i++) {
        const [ link, metaMatch ] = this.links[i].find(actionType);
        if (link && (!metaActionType || metaMatch || metaActionType == this.action.type)) {
          return [ link, true ];
        }
      }

    } else if (this.action.type == actionType) {
      return [ this, false ];
    }
    return [ undefined, false ];
  }

  prune(): boolean {
    if (this.seen) {
      // prune this link only if all
      // its links have also be seen
      this.links.forEach((link, index) => {
        if (link.prune()) {
          this.links.splice(index, 1);
        }
      });
      return this.links.length == 0;
    }
    return false;
  }

  success<P = any>(
    payload?: P,
    successActionValidator: ActionValidator<S, P> = nullValidator
  ): ActionLink<S> {
    const successLink = new ActionLink(
      <Action<P>>{
        type: SUCCESS,
        payload,
        meta: {
          timestamp: Date.now(),
          relatedAction: {
            ...this.action
          }
        }
      },
      successActionValidator
    );
    this.links.push(successLink);
    return successLink;
  }

  error(
    payload: string | ErrorPayload = '',
    errorActionValidator: ActionValidator<S, ErrorPayload> = nullValidator
  ): ActionLink<S> {
    const errorLink = new ActionLink(
      typeof payload == 'string'
        ? <Action<ErrorPayload>>{
          type: ERROR,
          payload: {
            err: Error(payload),
            message: payload
          },
          meta: {
            timestamp: Date.now(),
            relatedAction: {
              ...this.action
            }
          }
        }
        : <Action<ErrorPayload>>{
          type: ERROR,
          payload,
          meta: {
            timestamp: Date.now(),
            relatedAction: {
              ...this.action
            }
          }
        },
      errorActionValidator
    );

    this.links.push(errorLink);
    return errorLink;
  }

  followUpAction<P>(
    type: string,
    payload?: P,
    actionValidator = nullValidator
  ): ActionLink<S> {
    const link = new ActionLink(
      <Action<P>>{
        type,
        payload,
        meta: {
          timestamp: Date.now()
        }
      },
      actionValidator
    );
    this.links.push(link);
    return link;
  }
}
