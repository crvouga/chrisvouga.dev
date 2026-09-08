import { assert } from "@pkgs/assert";
import {
  isFastFailHttpStatus,
  probeHttp,
  serviceHealthUrl,
  waitForServiceHealthy,
  type HttpProbeResult,
} from "./service-health.js";

assert.defined(probeHttp, "fly-health probeHttp must be defined");
assert.defined(serviceHealthUrl, "fly-health serviceHealthUrl must be defined");
assert.defined(waitForServiceHealthy, "fly-health waitForServiceHealthy must be defined");
assert.defined(isFastFailHttpStatus, "fly-health isFastFailHttpStatus must be defined");

export {
  probeHttp,
  serviceHealthUrl,
  waitForServiceHealthy,
  isFastFailHttpStatus,
  type HttpProbeResult,
};
