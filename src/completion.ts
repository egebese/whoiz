// Shell completion scripts for whoiz.

const FLAGS = [
  "--tui",
  "--json",
  "--no-open",
  "--register",
  "-r",
  "--fields",
  "-f",
  "--watch",
  "-w",
  "--interval",
  "-i",
  "--concurrency",
  "-c",
  "--timeout",
  "-t",
  "--completion",
  "--help",
  "--version",
  "-v",
];

const FIELDS = [
  "status",
  "period",
  "expiry",
  "created",
  "updated",
  "registrar",
  "ns",
  "dnssec",
  "links",
  "raw",
];

const SUBCOMMANDS = ["watch", "history"];
const WATCH_SUBCOMMANDS = [
  "add",
  "remove",
  "list",
  "tick",
  "run",
  "install",
  "uninstall",
  "status",
  "doctor",
  "poke",
];

function bash(): string {
  return `# whoiz bash completion
# install: whoiz --completion bash > /usr/local/etc/bash_completion.d/whoiz
_whoiz_complete() {
  local cur prev words cword
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  # If first word is a subcommand, complete its sub-tokens.
  if [[ "\${COMP_WORDS[1]}" == "watch" && \$COMP_CWORD -eq 2 ]]; then
    COMPREPLY=( \$(compgen -W "${WATCH_SUBCOMMANDS.join(" ")}" -- "\$cur") )
    return 0
  fi
  case "\$prev" in
    --fields|-f)
      COMPREPLY=( \$(compgen -W "${FIELDS.join(" ")}" -- "\$cur") )
      return 0 ;;
    --completion)
      COMPREPLY=( \$(compgen -W "bash zsh fish" -- "\$cur") )
      return 0 ;;
  esac
  if [[ "\$cur" == -* ]]; then
    COMPREPLY=( \$(compgen -W "${FLAGS.join(" ")}" -- "\$cur") )
  elif [[ \$COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( \$(compgen -W "${SUBCOMMANDS.join(" ")}" -- "\$cur") )
  fi
}
complete -F _whoiz_complete whoiz
`;
}

function zsh(): string {
  return `#compdef whoiz
# whoiz zsh completion
_whoiz() {
  local -a flags fields shells subs watchsubs
  flags=(${FLAGS.map((f) => `'${f}'`).join(" ")})
  fields=(${FIELDS.map((f) => `'${f}'`).join(" ")})
  shells=('bash' 'zsh' 'fish')
  subs=(${SUBCOMMANDS.map((s) => `'${s}'`).join(" ")})
  watchsubs=(${WATCH_SUBCOMMANDS.map((s) => `'${s}'`).join(" ")})
  if [[ "\$words[2]" == "watch" && \$CURRENT -eq 3 ]]; then
    compadd -- \$watchsubs
    return 0
  fi
  case "\$words[CURRENT-1]" in
    --fields|-f)
      compadd -- \$fields
      return 0 ;;
    --completion)
      compadd -- \$shells
      return 0 ;;
  esac
  if [[ "\$words[CURRENT]" == -* ]]; then
    compadd -- \$flags
  elif [[ \$CURRENT -eq 2 ]]; then
    compadd -- \$subs
  fi
}
_whoiz "\$@"
`;
}

function fish(): string {
  return `# whoiz fish completion
${FLAGS.map((f) => {
  const long = f.startsWith("--");
  return `complete -c whoiz ${long ? `-l ${f.slice(2)}` : `-s ${f.slice(1)}`}`;
}).join("\n")}

# field values for --fields/-f
complete -c whoiz -l fields -x -a "${FIELDS.join(" ")}"
complete -c whoiz -s f -x -a "${FIELDS.join(" ")}"

# completion shells for --completion
complete -c whoiz -l completion -x -a "bash zsh fish"

# top-level subcommands
complete -c whoiz -n "__fish_use_subcommand" -a "${SUBCOMMANDS.join(" ")}"

# watch subcommands
complete -c whoiz -n "__fish_seen_subcommand_from watch" -a "${WATCH_SUBCOMMANDS.join(" ")}"
`;
}

export function completionScript(shell: string): string | null {
  switch (shell) {
    case "bash":
      return bash();
    case "zsh":
      return zsh();
    case "fish":
      return fish();
    default:
      return null;
  }
}
