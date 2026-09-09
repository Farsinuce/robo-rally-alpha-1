// Proves that main.ts still turns into blocks.
//
// `pxt build` only proves main.ts COMPILES. The kids never see JavaScript, so
// what actually matters is that the editor can decompile main.ts back into the
// Blocks view - and a construct Blocks cannot represent does NOT fail the
// decompile. It silently becomes a grey "typescript_statement" (or, in an
// argument slot, "typescript_expression") block that a nine year old can
// neither read nor edit. So `success: true` is not the check; the absence of
// grey blocks is.
//
// Run it with:  node tools/check-blocks.js
// Exits non-zero if main.ts would give the kids a broken Blocks view.
//
// `pxt service decompile` on its own throws ("Cannot read properties of
// undefined (reading 'fileSystem')") because the CLI never passes the options
// it built in setOptions through to the decompile call. The wrapper below
// remembers them and puts them back.

const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")
const target = path.join(root, "node_modules", "pxt-arcade")

const sources = process.argv.slice(2)
const file = sources.length ? sources[0] : path.join(root, "main.ts")
const src = fs.readFileSync(file, "utf8")

process.chdir(root)
const pxtjs = require(path.join(root, "node_modules", "pxt-core", "built", "pxt.js"))
const svc = global.pxtc.service

let lastOpts = null
const orig = svc.performOperation.bind(svc)
svc.performOperation = function (op, data) {
    if (op === "setOptions") lastOpts = data.options
    if (op === "decompile") {
        const o = lastOpts
        o.fileSystem["main.ts"] = src
        o.fileSystem["main.blocks"] = ""
        data = Object.assign({}, data, { options: o, fileName: "main.ts" })
    }
    return orig(op, data)
}

process.argv = [process.argv[0], process.argv[1], "service", "decompile"]

pxtjs.mainCli(target).then(() => {
    const r = JSON.parse(fs.readFileSync(path.join(root, "built", "response.json"), "utf8"))
    const problems = []

    if (!r.success) problems.push("the decompiler failed outright")
    for (const d of r.diagnostics || []) {
        const text = typeof d.messageText === "string" ? d.messageText : JSON.stringify(d.messageText)
        problems.push("TS" + d.code + ": " + text)
    }

    const blocks = (r.outfiles && r.outfiles["main.blocks"]) || ""
    if (!blocks) problems.push("no main.blocks was produced at all")

    const types = blocks.match(/type="[A-Za-z_0-9\-]+"/g) || []
    const census = {}
    for (const t of types) {
        const name = t.slice(6, -1)
        census[name] = (census[name] || 0) + 1
    }
    const grey = (census["typescript_statement"] || 0) + (census["typescript_expression"] || 0)
    if (grey > 0) {
        problems.push(grey + " grey block(s) - something in " + path.basename(file) +
            " has no Blocks equivalent, so the kids would see an uneditable box")
    }

    const names = Object.keys(census).sort()
    console.log(path.relative(root, file) + ": " + names.length + " block types, " +
        types.length + " blocks")
    for (const n of names) console.log("  " + census[n] + "  " + n)

    if (problems.length) {
        console.log("")
        for (const p of problems) console.log("FAIL: " + p)
        process.exit(1)
    }
    console.log("\nOK: main.ts decompiles cleanly, no grey blocks.")
    process.exit(0)
}, e => {
    console.log("ERROR", (e && e.stack) || e)
    process.exit(1)
})
