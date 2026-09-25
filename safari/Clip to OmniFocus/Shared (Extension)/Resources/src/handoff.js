// Runs in handoff.html. MV3's extension CSP blocks inline scripts, so this
// has to be its own file or the navigation below never happens.
const target = new URLSearchParams(location.search).get("target");
if (target && target.startsWith("omnifocus://")) {
  location.replace(target);
}
