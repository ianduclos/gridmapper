# Background agent (macOS launchd)

Runs gridmapper in the background always, like twistermapper's agent. It launches the
**sim** (`src/cli/sim.ts` via `tsx`), which is the fullest app: it bridges OSC to/from
Max (in **57131** / out **57130**), auto-connects to the grid with runtime hotplug, and
serves the web UI on **57191**. The UI is only *served* — nothing opens a browser; visit
http://localhost:57191 yourself when you want it.

`com.ianduclos.gridmapper.plist` here is a **copy** of what's installed at
`~/Library/LaunchAgents/com.ianduclos.gridmapper.plist`. Paths are machine-specific
(node, repo, tsx); edit if the repo moves. It runs `tsx` on the source directly, so it
always reflects the latest code — no build step.

## Install / load
```sh
cp deploy/com.ianduclos.gridmapper.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ianduclos.gridmapper.plist
```

## Manage
```sh
launchctl list | grep gridmapper                 # is it running? (col 1 = pid, col 2 = last exit)
tail -f ~/Library/Logs/gridmapper.log            # logs
launchctl kickstart -k gui/$(id -u)/com.ianduclos.gridmapper   # restart (pick up code changes)
launchctl bootout gui/$(id -u)/com.ianduclos.gridmapper        # stop + unload
```

## Developing while the agent runs
The agent holds OSC port **57131** and claims the grid's key routing from serialosc, so a
manual `npm run sim` can't run at the same time. To iterate:
```sh
launchctl bootout gui/$(id -u)/com.ianduclos.gridmapper   # free the port + grid
npm run sim                                                # dev (live tsx, web mirror)
# …when done, bring the agent back:
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ianduclos.gridmapper.plist
```
(Since the agent runs `tsx` on source, a `kickstart -k` is enough to pick up edits if you
don't need a separate dev instance.)
