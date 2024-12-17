# BoltOps CLI (Currently in Alpha Development!)

A toolkit for working with bolt.new and bolt.diy -- currently implements file synchronization.

## Features

- 🔄 Bi-directional file synchronization
- 👀 Real-time file watching
- 🎯 Selective sync with `.syncignore` support
- 🔐 Secure authentication
- 📁 Multi-project workspace support

## Installation

```bash
npm install -g boltops
```

Or run directly with npx:

```bash
npx boltops [command]
```

## Commands

### Host Server

Start a host server to handle file synchronization requests:

```bash
BOLTOPS_SECRET=your-secret boltops host --port=8017 ./workspace
```

Options:
- `--port`: Server port number (default: 8017)
- `<workspace>`: Path to workspace directory

### Copy Files

Copy files from a remote host to a local project directory:

```bash
BOLTOPS_SECRET=your-secret boltops copy \
  --project=project-id \
  --host=http://localhost:8017 \
  --clean \
  --sync \
  ./project
```

Options:
- `--project`: Project identifier
- `--host`: Host server URL
- `--clean`: Remove local files not present on remote
- `--sync`: Sync files back when changed after copy
- `<path>`: Target project directory

### Sync Files

Watch and sync files between local project and remote host:

```bash
BOLTOPS_SECRET=your-secret boltops sync \
  --project=project-id \
  --host=http://localhost:8017 \
  --all \
  ./project
```

Options:
- `--project`: Project identifier
- `--host`: Host server URL
- `--all`: Perform initial sync of all files
- `<path>`: Project directory to watch

## Environment Variables

- `BOLTOPS_SECRET`: Authentication secret (required)
- `BOLTOPS_PROJECT`: Default --project identifier
- `BOLTOPS_HOST`: Default --host server URL

Environment variables can be set directly or via a `.env` file.

## Selective Synchronization

Create a `.syncignore` file in `/configs/${BOLTOPS_PROJECT}/.syncignore` under the host workspace to exclude files from synchronization. Uses glob patterns similar to `.gitignore`:

```
# Example .syncignore
node_modules/
*.log
.DS_Store
```

Note that `.git` and `node_modules` directories are always ignored.

## Security

- All commands require a `BOLTOPS_SECRET` for authentication
- Communication between client and host is secured with bearer token authentication
- Host server validates all requests against the configured secret

## Examples

1. Start a host server:
```bash
BOLTOPS_SECRET=mysecret123 boltops host ./workspace
```

2. Copy files from remote:
```bash
BOLTOPS_SECRET=mysecret123 \
BOLTOPS_PROJECT=myapp \
BOLTOPS_HOST=http://localhost:8017 \
boltops copy --clean ./myproject
```

3. Start file synchronization:
```bash
BOLTOPS_SECRET=mysecret123 \
BOLTOPS_PROJECT=myapp \
BOLTOPS_HOST=http://localhost:8017 \
boltops sync --all ./myproject
```

## License

MIT
