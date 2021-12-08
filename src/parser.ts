import Changelog from "./Changelog.ts";
import Release from "./Release.ts";

export interface Options {
  /**
   * Custom function to create Release instances.
   * Needed if you want to use a custom Release class.
   */
  releaseCreator: (
    version?: string,
    date?: string,
    description?: string,
  ) => Release;
}

const defaultOptions: Options = {
  releaseCreator: (version, date, description) =>
    new Release(version, date, description),
};

/** Parse a markdown string */
export default function parser(markdown: string, options?: Options): Changelog {
  const opts = Object.assign({}, defaultOptions, options);
  const tokens = tokenize(markdown);

  try {
    return processTokens(tokens, opts);
  } catch (error) {
    throw new Error(
      `Parse error in the line ${tokens[0][0]}: ${error.message}`,
    );
  }
}

/** Process an array of tokens to build the Changelog */
function processTokens(tokens: Token[], opts: Options): Changelog {
  const changelog = new Changelog("");

  changelog.flag = getContent(tokens, "flag");
  changelog.title = getContent(tokens, "h1", true);
  changelog.description = getContent(tokens, "p");

  //Releases
  let release;

  while ((release = getContent(tokens, "h2").toLowerCase())) {
    const matches = release.match(
      /\[?([^\]]+)\]?\s*-\s*([\d]{4}-[\d]{1,2}-[\d]{1,2})$/,
    );

    if (matches) {
      release = opts.releaseCreator(matches[1], matches[2]);
    } else if (release.includes("unreleased")) {
      const matches = release.match(/\[?([^\]]+)\]?\s*-\s*unreleased$/);
      release = matches
        ? opts.releaseCreator(matches[1])
        : opts.releaseCreator();
    } else {
      throw new Error(`Syntax error in the release title`);
    }

    changelog.addRelease(release);
    release.description = getContent(tokens, "p");

    let type;

    while ((type = getContent(tokens, "h3").toLowerCase())) {
      let change;

      while ((change = getContent(tokens, "li"))) {
        release.addChange(type, change);
      }
    }
  }

  //Skip release links
  let link = getContent(tokens, "link");

  while (link) {
    if (!changelog.url) {
      const matches = link.match(/^\[.*\]\:\s*(http.*)\/compare\/.*$/);

      if (matches) {
        changelog.url = matches[1];
      }
    }

    link = getContent(tokens, "link");
  }

  //Footer
  if (getContent(tokens, "hr")) {
    changelog.footer = getContent(tokens, "p");
  }

  if (tokens.length) {
    throw new Error(`Unexpected content ${JSON.stringify(tokens)}`);
  }

  return changelog;
}

/** Returns the content of a token */
function getContent(
  tokens: Token[],
  type: TokenType,
  required = false,
): string {
  if (!tokens[0] || tokens[0][1] !== type) {
    if (required) {
      throw new Error(`Required token missing in: "${tokens[0][0]}"`);
    }

    return "";
  }

  return tokens.shift()![2].join("\n");
}

type TokenType = "h1" | "h2" | "h3" | "li" | "p" | "link" | "flag" | "hr";
type Token = [number, TokenType, string[]];

/** Tokenize a markdown string */
function tokenize(markdown: string): Token[] {
  const tokens: Token[] = [];

  markdown
    .trim()
    .split("\n")
    .map((line, index: number): Token => {
      const lineNumber = index + 1;

      if (line.startsWith("---")) {
        return [lineNumber, "hr", ["-"]];
      }

      if (line.startsWith("# ")) {
        return [lineNumber, "h1", [line.substr(1).trim()]];
      }

      if (line.startsWith("## ")) {
        return [lineNumber, "h2", [line.substr(2).trim()]];
      }

      if (line.startsWith("### ")) {
        return [lineNumber, "h3", [line.substr(3).trim()]];
      }

      if (line.startsWith("-")) {
        return [lineNumber, "li", [line.substr(1).trim()]];
      }

      if (line.startsWith("*")) {
        return [lineNumber, "li", [line.substr(1).trim()]];
      }

      if (line.match(/^\[.*\]\:\s*http.*$/)) {
        return [lineNumber, "link", [line.trim()]];
      }

      const result = line.match(/^<!--(.*)-->$/)!;
      if (result) {
        return [lineNumber, "flag", [result[1].trim()]];
      }

      return [lineNumber, "p", [line.trimEnd()]];
    })
    .forEach((line: Token, index: number) => {
      const [lineNumber, type, [content]] = line;

      if (index > 0) {
        const prevType = tokens[0][1];

        if (type === "p") {
          if (prevType === "p") {
            return tokens[0][2].push(content);
          }

          if (prevType === "li") {
            return tokens[0][2].push(content.replace(/^\s\s/, ""));
          }
        }
      }

      tokens.unshift([lineNumber, type, [content]]);
    });

  return tokens
    .filter((token) => !isEmpty(token[2]))
    .map((token) => {
      const content = token[2];

      while (isEmpty(content[content.length - 1])) {
        content.pop();
      }

      while (isEmpty(content[0])) {
        content.shift();
      }

      return token;
    })
    .reverse();
}

/** Check if a string or array is empty */
function isEmpty(val: string | string[]): boolean {
  if (Array.isArray(val)) {
    val = val.join("");
  }

  return !val || val.trim() === "";
}
