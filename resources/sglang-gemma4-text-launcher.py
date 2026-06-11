import os
import runpy
import sys

from sglang.srt import server_args as sa
from sglang.srt.configs import model_config as mc

orig_model_config_init = mc.ModelConfig.__init__
orig_server_args_post_init = sa.ServerArgs.__post_init__


def is_text_only_gemma4_model(model_path):
    return str(model_path).startswith("jedisct1/gemma-4-12B-it-txt-mlx")


def patched_server_args_post_init(self):
    if is_text_only_gemma4_model(getattr(self, "model_path", "")) and self.enable_multimodal is None:
        self.enable_multimodal = False
    return orig_server_args_post_init(self)


def patched_model_config_init(self, model_path, *args, **kwargs):
    if (
        is_text_only_gemma4_model(model_path)
        and kwargs.get("enable_multimodal") is None
    ):
        kwargs["enable_multimodal"] = False
    elif is_text_only_gemma4_model(model_path) and len(args) >= 7 and args[6] is None:
        args = (*args[:6], False, *args[7:])
    return orig_model_config_init(self, model_path, *args, **kwargs)


sa.ServerArgs.__post_init__ = patched_server_args_post_init
mc.ModelConfig.__init__ = patched_model_config_init
os.environ.setdefault("SGLANG_USE_MLX", "1")
os.environ.setdefault("PYTHONUNBUFFERED", "1")
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")


if __name__ == "__main__":
    sys.argv = ["sglang.launch_server", *sys.argv[1:]]
    runpy.run_module("sglang.launch_server", run_name="__main__")
