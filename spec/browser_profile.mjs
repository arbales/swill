import {rm} from "node:fs/promises";

// Chrome helpers may touch the profile after its main process exits. Deno's
// fs.rm does not implement Node's maxRetries, so retry those transient errors
// explicitly, with a bounded delay. Unrelated or persistent failures still fail.
export async function removeBrowserProfile(
  profile,
  remove = rm,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await remove(profile, {recursive: true, force: true});
      return;
    } catch (error) {
      if (attempt === 5 || !["ENOTEMPTY", "EBUSY", "EPERM"].includes(error.code)) throw error;
      await wait(100 * (attempt + 1));
    }
  }
}
