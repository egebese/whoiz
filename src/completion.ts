// Shell completion scripts for whoiz.
// Each script is intentionally small — we only complete flags, not domains
// (whois has no useful candidate set without a network call).

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

function bash(): string {
  return `# whoiz bash completion
# install: whoiz --completion bash > /usr/local/etc/bash_completion.d/whoiz
#     or:  whoiz --completion bash >> ~/.bashrc
_whoiz_complete() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
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
  fi
}
complete -F _whoiz_complete whoiz
`;
}

function zsh(): string {
  return `#compdef whoiz
# whoiz zsh completion
# install: whoiz --completion zsh > "\${fpath[1]}/_whoiz" && compinit
_whoiz() {
  local -a flags fields shells
  flags=(${FLAGS.map((f) => `'${f}'`).join(" ")})
  fields=(${FIELDS.map((f) => `'${f}'`).join(" ")})
  shells=('bash' 'zsh' 'fish')
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
  fi
}
_whoiz "\$@"
`;
}

function fish(): string {
  return `# whoiz fish completion
# install: whoiz --completion fish > ~/.config/fish/completions/whoiz.fish
${FLAGS.map((f) => {
  const long = f.startsWith("--");
  return `complete -c whoiz ${long ? `-l ${f.slice(2)}` : `-s ${f.slice(1)}`}`;
}).join("\n")}

# field values for --fields/-f
complete -c whoiz -l fields -x -a "${FIELDS.join(" ")}"
complete -c whoiz -s f -x -a "${FIELDS.join(" ")}"

# completion shells for --completion
complete -c whoiz -l completion -x -a "bash zsh fish"
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
