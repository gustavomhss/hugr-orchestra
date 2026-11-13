// Fixed helper source only. Requests travel on stdin; interpreted program text is never executable helper code.
export const script = String.raw`
const request = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
const capture = (value) => value === undefined ? { kind: "undefined" } : { kind: "text", value };
const groups = (value) => Object.fromEntries(Object.entries(value).map(([key, value]) => [key, capture(value)]));
const match = (value) => ({
  captures: Array.from(value, capture),
  ...(value.index === undefined ? {} : { index: value.index }),
  ...(value.groups === undefined ? {} : { groups: groups(value.groups) }),
});
let regex;
const state = () => ({ source: regex.source, flags: regex.flags, lastIndex: regex.lastIndex });
let reply;
try {
  regex = request.operation === "construct"
    ? new RegExp(request.pattern, request.flags)
    : new RegExp(request.regex.source, request.regex.flags);
  if (request.operation !== "construct") regex.lastIndex = request.regex.lastIndex;
  let result;
  switch (request.operation) {
    case "construct": result = { kind: "constructed" }; break;
    case "test": result = { kind: "boolean", value: regex.test(request.subject) }; break;
    case "exec": {
      const value = regex.exec(request.subject);
      result = { kind: "match", value: value === null ? null : match(value) };
      break;
    }
    case "match": {
      const value = request.subject.match(regex);
      result = regex.global
        ? { kind: "strings", value }
        : { kind: "match", value: value === null ? null : match(value) };
      break;
    }
    case "matchAll": result = { kind: "matches", value: Array.from(request.subject.matchAll(regex), match) }; break;
    case "search": result = { kind: "number", value: request.subject.search(regex) }; break;
    case "split": result = { kind: "split", value: request.subject.split(regex, request.limit).map(capture) }; break;
    case "replace": result = { kind: "string", value: request.subject.replace(regex, request.replacement) }; break;
    case "replaceAll": result = { kind: "string", value: request.subject.replaceAll(regex, request.replacement) }; break;
    case "collectReplace":
    case "collectReplaceAll": {
      const value = [];
      // Only this fixed collector runs in the child. User callbacks remain in their parent Effect/Scope.
      const collect = (...args) => {
        const named = typeof args[args.length - 1] === "object";
        const tail = named ? 3 : 2;
        value.push({
          match: args[0], offset: args[args.length - tail],
          captures: args.slice(1, args.length - tail).map(capture),
          ...(named ? { groups: groups(args[args.length - 1]) } : {}),
        });
        return "";
      };
      if (request.operation === "collectReplace") request.subject.replace(regex, collect);
      else request.subject.replaceAll(regex, collect);
      result = { kind: "replacements", value };
      break;
    }
    default: throw new Error("Unknown native regex operation");
  }
  reply = { version: 1, ok: true, operation: request.operation, regex: state(), result };
} catch (error) {
  reply = {
    version: 1, ok: false, operation: request.operation,
    ...(regex === undefined ? {} : { regex: state() }),
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  };
}
process.stdout.write(JSON.stringify(reply));
`
