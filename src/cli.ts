#!/usr/bin/env node

const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case "install":
    console.log("otto install — not yet implemented")
    break
  case "upgrade":
    console.log("otto upgrade — not yet implemented")
    break
  case "status":
    console.log("otto status — not yet implemented")
    break
  case "doctor":
    console.log("otto doctor — not yet implemented")
    break
  default:
    console.log("Usage: otto <install|upgrade|status|doctor>")
    break
}

process.exit(0)
