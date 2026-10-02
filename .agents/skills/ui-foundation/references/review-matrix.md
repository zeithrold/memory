# UI review matrix

Choose scenarios relevant to the changed flow; do not create fictional data just to fill a screenshot.

| Dimension | Evidence to inspect |
| --- | --- |
| State | Loading, empty, populated, validation error, service error, success, retry |
| Layout | Narrow and wide surfaces, large text, long translated labels, overflow |
| Interaction | Pointer or touch, keyboard, focus, dismissal, back navigation |
| Semantics | Control names, labels, error relationships, reading order |
| Recovery | Preserved inputs, retry behavior, ambiguous outcomes |
| Appearance | Light/dark modes when supported, contrast, reduced motion |

Record the tested environment and exact limitations. Use the project's native accessibility tools and tests.
