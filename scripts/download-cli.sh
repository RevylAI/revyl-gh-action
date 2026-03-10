#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage: download-cli.sh --os <os> --arch <arch> --version <version> --output-dir <dir>

Downloads the requested Revyl CLI binary, validates it with `version`, and prints
the resolved local path to stdout.
EOF
}

build_binary_name() {
  local os="$1"
  local arch="$2"
  local ext=""

  if [ "$os" = "windows" ]; then
    ext=".exe"
  fi

  printf 'revyl-%s-%s%s' "$os" "$arch" "$ext"
}

build_download_url() {
  local binary="$1"
  local version="$2"
  local base_url="${REVYL_CLI_RELEASES_BASE_URL:-https://github.com/RevylAI/revyl-cli/releases}"

  if [ -n "${REVYL_CLI_DOWNLOAD_URL:-}" ]; then
    printf '%s' "${REVYL_CLI_DOWNLOAD_URL}"
    return
  fi

  if [ "$version" = "latest" ]; then
    printf '%s/latest/download/%s' "$base_url" "$binary"
    return
  fi

  printf '%s/download/%s/%s' "$base_url" "$version" "$binary"
}

main() {
  local os=""
  local arch=""
  local version=""
  local output_dir=""

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --os)
        os="$2"
        shift 2
        ;;
      --arch)
        arch="$2"
        shift 2
        ;;
      --version)
        version="$2"
        shift 2
        ;;
      --output-dir)
        output_dir="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage
        exit 1
        ;;
    esac
  done

  if [ -z "$os" ] || [ -z "$arch" ] || [ -z "$version" ] || [ -z "$output_dir" ]; then
    usage
    exit 1
  fi

  mkdir -p "$output_dir"

  local binary
  binary="$(build_binary_name "$os" "$arch")"

  local output_path="${output_dir%/}/${binary}"
  local download_url
  download_url="$(build_download_url "$binary" "$version")"

  echo "Downloading Revyl CLI from ${download_url}..." >&2
  if ! curl --fail --show-error --silent --location --output "$output_path" "$download_url"; then
    echo "::error::Failed to download Revyl CLI from ${download_url} (version=${version}, os=${os}, arch=${arch})" >&2
    exit 1
  fi

  if [ "$os" != "windows" ]; then
    chmod +x "$output_path"
  fi

  echo "Validating Revyl CLI from ${output_path}..." >&2
  local version_output=""
  if ! version_output="$("$output_path" version 2>&1)"; then
    echo "::error::Downloaded Revyl CLI failed validation. url=${download_url} path=${output_path}" >&2
    printf '%s\n' "$version_output" >&2
    exit 1
  fi

  echo "Revyl CLI ready: ${version_output}" >&2
  printf '%s\n' "$output_path"
}

main "$@"
