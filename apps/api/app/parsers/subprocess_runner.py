import subprocess  # noqa: S404
from pathlib import Path


class SubprocessExecutionError(RuntimeError):
    """Raised when an isolated parser subprocess fails or times out."""


def run_isolated_cli(
    executable: str,
    args: list[str],
    target_file: Path,
    timeout_seconds: int = 15,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    """
    Execute an external binary safely with shell=False and '--' path separation.
    Target filename must already be a server-generated safe name (e.g. input.bin).
    """
    if not target_file.is_file():
        raise FileNotFoundError(f"Missing target file: {target_file}")

    cmd = [executable, *args, "--", str(target_file)]
    try:
        return subprocess.run(  # noqa: S603
            cmd,
            cwd=str(cwd) if cwd else None,
            shell=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise SubprocessExecutionError(
            f"Parser '{executable}' timed out after {timeout_seconds}s"
        ) from exc
