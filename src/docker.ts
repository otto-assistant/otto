import { execSync } from "node:child_process"
import path from "node:path"

export interface DockerComposeCommand {
  command: string
  args: string[]
}

export function buildComposeCommand(tenantPath: string, subArgs: string[]): DockerComposeCommand {
  const composeFile = path.join(path.resolve(tenantPath), "compose.yml")
  return {
    command: "docker",
    args: ["compose", "-f", composeFile, ...subArgs],
  }
}

export function runCompose(tenantPath: string, subArgs: string[]): void {
  const built = buildComposeCommand(tenantPath, subArgs)
  execSync(`${built.command} ${built.args.join(" ")}`, {
    stdio: "inherit",
    timeout: 120_000,
  })
}
