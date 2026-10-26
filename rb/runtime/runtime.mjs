// Browser runtime surface used by generated and framework code: the UI
// runtime plus the remote data client.
import {UIRuntime} from "./runtime_ui.mjs";
import {
  configureData, closeData, registerDataLifecycle, connectData, dataConnected, dataRequest,
  dataTime, dataTimeISO, dataTimeFromISO, dataRecord
} from "./data_client.mjs";
import {
  dataValueType, dataValuePayload, dataDateFromISO, dataDateISO, dataDateTimeFromISO,
  dataDecimalFromString, dataTimeOfDayFromISO, dataRange, dataInterval, compareDecimal
} from "./data_values.mjs";

export const Runtime = {
  ...UIRuntime,

  // Remote data
  configureData, closeData, registerDataLifecycle, connectData, dataConnected, dataRequest,
  dataTime, dataTimeISO, dataTimeFromISO, dataRecord,
  dataValueType, dataValuePayload, dataDateFromISO, dataDateISO, dataDateTimeFromISO,
  dataDecimalFromString, dataTimeOfDayFromISO, dataRange, dataInterval, compareDecimal
};
