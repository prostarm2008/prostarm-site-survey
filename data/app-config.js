/* ------------------------------------------------------------------
   Deployment settings. This is the only file you edit after handover.

   flowUrl   Paste the "HTTP POST URL" shown on the Power Automate
             trigger "When an HTTP request is received". Leave it as an
             empty string to run the app entirely on the device.

   Keep flowContentType as text/plain. It makes the browser send a
   "simple" request, so no CORS preflight is issued — the Power
   Automate request trigger does not answer preflight OPTIONS calls.
   The flow reads the body with json(triggerBody()), so the text/plain
   header costs nothing.
------------------------------------------------------------------ */
const APP_CONFIG = {
  flowUrl: 'https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/05/workflows/bbb91f5798ed4bd9989fbfc2d1ba065d/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=xwRFQTzbnO8kYEiJPhwQKueFx-JhkUmEGXuYyTaozuE',

  // Second flow, GET, used only by admin / branch / regional sign-ins to read
  // every engineer's surveys back out of SharePoint. Leave empty and the
  // "My surveys" tab shows only what is on this device.
  listUrl: 'https://8549b42c711be8948675eefb5cf215.dd.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/16/workflows/6292d4da5508453a856e044fb911d3fa/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=9GIxROX-0ONm7wqugwPPKHG7F6iWhk2hVk4INXIqW70',

  flowContentType: 'text/plain;charset=UTF-8'
};
