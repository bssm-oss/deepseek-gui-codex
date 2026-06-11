import os
import runpy
import sys

from sglang.srt.configs import model_config as mc

orig_model_config_init = mc.ModelConfig.__init__


def patched_model_config_init(self, model_path, *args, **kwargs):
    if (
        str(model_path).startswith("jedisct1/gemma-4-12B-it-txt-mlx")
        and kwargs.get("enable_multimodal") is None
    ):
        kwargs["enable_multimodal"] = False
    return orig_model_config_init(self, model_path, *args, **kwargs)


mc.ModelConfig.__init__ = patched_model_config_init
os.environ.setdefault("SGLANG_USE_MLX", "1")
os.environ.setdefault("PYTHONUNBUFFERED", "1")


if __name__ == "__main__":
    sys.argv = ["sglang.launch_server", *sys.argv[1:]]
    runpy.run_module("sglang.launch_server", run_name="__main__")
