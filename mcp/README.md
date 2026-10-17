# n-gym MCP server

Lets a desktop MCP client (for example Claude Desktop) use the same actions as the phone's coach.
It reads your data from an n-gym backup file. Changes it suggests are not applied: they are queued in
a change file, and you approve them on the phone.

## Setup

1. On the phone, turn on weekly backups to a folder that syncs to your computer (Settings → Backup),
   or export a backup and copy it over.
2. Install dependencies in this repository: `npm install`.
3. Add the server to your client. For Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "n-gym": {
      "command": "npx",
      "args": ["tsx", "/path/to/n-gym/mcp/server.mts", "--backup", "/path/to/synced/n-gym-backup.json"]
    }
  }
}
```

The backup is reloaded whenever the file changes. Changes are written to `n-gym-changes.json` next to
the backup; pass `--changes <file>` to put them elsewhere.

## Approving changes

On the phone: Settings → Import coach changes, then pick the change file. Each change is previewed
against the phone's current data with the same approval card the on-device coach uses. Importing the
same file again skips changes you already approved or rejected.
