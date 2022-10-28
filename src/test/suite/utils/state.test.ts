import {State, StateApi} from '../../../utils/state';
import {anyString, instance, mock, when} from 'ts-mockito';
import * as vscode from 'vscode';
import * as assert from 'assert';

suite('State Utility Test Suite', () => {
   // set up mocks
   const ctxMock = mock<vscode.ExtensionContext>();
   const workspaceStateMock = mock<vscode.Memento>();
   const stateMap = new Map<string, string>();
   when(workspaceStateMock.get(anyString())).thenCall((key: string) =>
      stateMap.get(key)
   );
   when(workspaceStateMock.update(anyString(), anyString())).thenCall(
      (key: string, val: string) => stateMap.set(key, val)
   );
   const workspaceState = instance(workspaceStateMock);
   when(ctxMock.workspaceState).thenReturn(workspaceState);
   const ctx = instance(ctxMock);

   test('it can get and set the port', () => {
      const state: StateApi = State.construct(ctx);
      assert.strictEqual(state.getPort(), undefined);
      const newPort = '8080';
      state.setPort(newPort);
      assert.strictEqual(state.getPort(), newPort);

      // ensure that state persists across state objects
      const state2 = State.construct(ctx);
      assert.strictEqual(state2.getPort(), state.getPort());
   });

   test('it can get and set the image', () => {
      const state: StateApi = State.construct(ctx);
      assert.strictEqual(state.getImage(), undefined);
      const newImage = 'nginx:latest';
      state.setImage(newImage);
      assert.strictEqual(state.getImage(), newImage);

      // ensure that state persists across state objects
      const state2 = State.construct(ctx);
      assert.strictEqual(state2.getImage(), state.getImage());
   });
});
