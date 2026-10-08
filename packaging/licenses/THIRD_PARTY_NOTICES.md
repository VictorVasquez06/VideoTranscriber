# Third-Party Notices

## FFmpeg

The Windows installer includes FFmpeg 9.0.2 full shared build from Gyan Doshi. This build is licensed under GPL version 3; its license text is included as `FFmpeg-GPL-3.0.txt` in the installed `resources/licenses` directory.

Build information: https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2
Gyan build source: https://github.com/GyanD/codexffmpeg/archive/refs/tags/9.0.2.zip
FFmpeg source commit: https://github.com/FFmpeg/FFmpeg/commit/946fcce07b

The build also includes external libraries. Their versions and configuration are listed in the FFmpeg build's `README.txt`; each component is governed by its own license.

## Whisper.cpp

The installer includes the `whisper-cli.exe` x64 CPU build from the official `b5454` release. Whisper.cpp is licensed under MIT; see `whisper.cpp.LICENSE` in this directory.

Release: https://github.com/ggml-org/whisper.cpp/releases/tag/b5454
Source: https://github.com/ggml-org/whisper.cpp/tree/b5454

## Whisper model

The installer includes the multilingual `ggml-base.bin` model converted for whisper.cpp. The original Whisper model and code are published under the MIT license.

Model source: https://huggingface.co/ggerganov/whisper.cpp
Original project and license: https://github.com/openai/whisper

## Microsoft Visual C++ runtime

The installer includes Microsoft Visual C++ runtime DLLs required by the bundled native tools. Microsoft runtime components are subject to Microsoft's license terms: https://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files
