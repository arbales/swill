// Browser runtime surface used by generated and framework code: the UI
// runtime plus the remote data client.
import {Runtime as UIRuntime} from "./runtime_ui.mjs";
import {
  configureData, closeData, registerDataLifecycle, connectData, dataConnected, dataRequest,
  dataTime, dataTimeIso, dataTimeFromIso, dataRecord
} from "./data_client.mjs";

export const Runtime = {
  ...UIRuntime,

  // Remote data
  configureData, closeData, registerDataLifecycle, connectData, dataConnected, dataRequest,
  dataTime, dataTimeIso, dataTimeFromIso, dataRecord
};
