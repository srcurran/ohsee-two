# settings/shared

Building blocks composed by **more than one** settings or wizard surface.
The *absence* of an owner prefix (contrast `TestSettings*`, which is owned by
`TestSettingsOverlay`) is the signal that a component is reused and lower-level.
If you change one, check every consumer in the table.

| Component           | Consumed by                                                          |
| ------------------- | ------------------------------------------------------------------- |
| `BreakpointEditor`  | SettingsOverlay, TestSettingsOverlay, NewTestWizard, settings pages  |
| `ScriptEditor`      | TestSettingsOverlay, NewTestWizard, AuthProfilesPanel               |
| `AuthProfilesPanel` | ProjectSettingsOverlay, TestSettingsOverlay, NewTestWizard          |
| `AuthProfileSelect` | TestSettingsOverlay, NewTestWizard                                  |
| `Wizard`            | NewProjectWizard, NewTestWizard                                     |
| `CodegenRecorder`   | ScriptEditor, ScriptStepEditor                                     |
| `SettingsAccordion` | ProjectSettingsOverlay, TestSettingsOverlay                        |

Surfaces (`*Overlay`, `*Wizard`) and their own single-owner children
(`TestSettings*`) stay one level up in `components/settings/`.
