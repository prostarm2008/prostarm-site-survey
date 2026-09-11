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
  flowUrl: '',

  // Second flow, GET, used only by admin / branch / regional sign-ins to read
  // every engineer's surveys back out of SharePoint. Leave empty and the
  // "My surveys" tab shows only what is on this device.
  listUrl: '',

  flowContentType: 'text/plain;charset=UTF-8'
};
