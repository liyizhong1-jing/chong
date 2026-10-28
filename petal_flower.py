import sys
import time

import numpy as np
import pyvista as pv
from matplotlib.colors import LinearSegmentedColormap

# ============ 参数 ============
length = 120.0
width_factor = 0.50
wave = 0.08
shape_p = 0.7
bowl_factor = 0.15
points_per_petal = 10000
point_size = 1
render_as_spheres = True
num_petals = 28

SAVE_ONLY = "--save" in sys.argv   # 只导出 petal_flower.png，不开窗口
USE_SSAA = "--ssaa" in sys.argv    # 显卡好时加 --ssaa 抗锯齿（本机默认关，见说明）

np.random.seed(0)

wine_red_cmap = LinearSegmentedColormap.from_list(
    'wine_red',
    [
        (0.18, 0.03, 0.12),   # 花心
        (0.40, 0.06, 0.17),   # 深酒红
        (0.68, 0.12, 0.24),   # 酒红
        (0.92, 0.22, 0.36),   # 紫红
        (1.00, 0.42, 0.60),   # 亮玫红
    ]
)


def generate_petal(length, width_factor, wave, shape_p):
    u = np.linspace(-1, 1, 80)
    v = np.linspace(0, 1, 160)
    U, V = np.meshgrid(u, v)
    width_profile = np.sin(np.pi * (V ** shape_p))
    X = U * width_factor * length * width_profile
    Y = length - V * length
    ripple = wave * length * np.sin(4 * np.pi * V) * (U ** 2)
    bowl = bowl_factor * length * ((1 - V) ** 2)
    Z = -ripple + bowl
    return np.stack([X, Y, Z], axis=-1), V


plotter = pv.Plotter(window_size=[900, 900], off_screen=SAVE_ONLY)
plotter.set_background('#050005')
all_points = []

yaw_rad = np.radians(22.0)
R_yaw = np.array([
    [np.cos(yaw_rad), -np.sin(yaw_rad), 0],
    [np.sin(yaw_rad),  np.cos(yaw_rad), 0],
    [0, 0, 1]
])

for n in range(num_petals):
    ang = n * 137.508
    r = 1.0 + n * 1.2
    x_trans = np.cos(np.radians(ang)) * r
    y_trans = np.sin(np.radians(ang)) * r
    scale = 0.15 + n * 0.035

    if n <= 4:
        curl_degree = 75.0
    elif n <= 11:
        curl_degree = 55.0
    elif n <= 19:
        curl_degree = 35.0
    else:
        curl_degree = 5.0

    pts, V = generate_petal(length * scale, width_factor, wave, shape_p)

    # 卷曲：只改 y、z，x 不动
    Y_old = pts[:, :, 1].copy()
    Z_shifted = pts[:, :, 2] - pts[-1, :, 2].mean()
    theta = (1 - V) * np.deg2rad(curl_degree)
    pts[:, :, 1] = Y_old * np.cos(theta)
    pts[:, :, 2] = Y_old * np.sin(theta) + Z_shifted

    pts = pts @ R_yaw.T

    theta_rad = np.radians(ang)
    c_z, s_z = np.cos(theta_rad), np.sin(theta_rad)
    R_z = np.array([
        [c_z, -s_z, 0],
        [s_z,  c_z, 0],
        [0, 0, 1]
    ])
    pts = pts @ R_z.T
    pts[:, :, 0] += x_trans
    pts[:, :, 1] += y_trans

    points = pts.reshape(-1, 3)
    if points_per_petal < len(points):
        idx = np.random.choice(len(points), points_per_petal, replace=False)
        points = points[idx]
    all_points.append(points)

all_points = np.vstack(all_points)

radial = np.sqrt(all_points[:, 0]**2 + all_points[:, 1]**2)
rn = (radial - radial.min()) / (radial.max() - radial.min() + 1e-9)
colors = wine_red_cmap(rn)[:, :3]
bright = np.random.uniform(0.55, 1.15, (len(all_points), 1))
colors = np.clip(colors * bright, 0, 1)
rgb_u8 = (colors * 255).astype(np.uint8)

plotter.add_points(
    all_points, scalars=rgb_u8, rgb=True,
    point_size=point_size, render_points_as_spheres=render_as_spheres,
    show_scalar_bar=False,
    ambient=0.40, diffuse=0.85, specular=0.50, specular_power=22,
)

mask = np.random.rand(len(all_points)) < 0.08
plotter.add_points(
    all_points[mask], color=(1.0, 0.30, 0.50),
    point_size=point_size * 1.8,
    render_points_as_spheres=True,
    ambient=1.0, diffuse=0.0, specular=0.0,
)

plotter.reset_camera()
plotter.camera.zoom(1.05)
if USE_SSAA:
    plotter.enable_anti_aliasing('ssaa')

print(f"酒红粒子花生成完成，总粒子数：{len(all_points)}")

if SAVE_ONLY:
    out = "petal_flower.png"
    plotter.show(auto_close=False)
    plotter.screenshot(out)
    plotter.close()
    print(f"已导出图片：{out}")
else:
    plotter.show(auto_close=False, interactive_update=True)
    for _ in range(100000):
        if getattr(plotter, "_closed", False):
            break
        plotter.camera.Azimuth(0.4)
        plotter.update()
        time.sleep(0.03)
