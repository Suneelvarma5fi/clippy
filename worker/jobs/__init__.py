"""
Job handler registry. Adding a job type = add a module here and register
its handler in HANDLERS.
"""

from jobs.transcribe import handle_transcribe
from jobs.identify import handle_identify_clips
from jobs.cut import handle_cut_clip
from jobs.export import handle_edit_clip, handle_style_clip

HANDLERS = {
    "transcribe":      handle_transcribe,
    "identify_clips":  handle_identify_clips,
    "cut_clip":        handle_cut_clip,
    "edit_clip":       handle_edit_clip,
    "style_clip":      handle_style_clip,
}
