# Chipet Demo 视频脚本（中文 · 约 2 分 20 秒，上限 3 分钟）

成片：`docs/demo-video/out/Chipet-Demo.mp4`  
字幕：`docs/demo-video/out/Chipet-Demo.srt`  
旁白：中文（婷婷）；画面为中文界面实机截图。

上传后把链接填进表单 **Link to Demo Video**（YouTube / X / Drive 公开可看即可）。

## 结构

| 时间 | 画面 | 旁白要点 |
|---|---|---|
| 开场 | Logo | Chipet：X Layer 上的加密猫，心脏是 TapeOut 电路 |
| 家园 | 首页英雄区 | 敲蛋孵化；毛色/瞳色/花纹由电路身份派生 |
| 芯喵页 | 宠物 + 心脏电路 | 现场 NAND 亮灯；猫特征；分享撸猫链接 |
| Studio | TapeHDL + AI | 门级设计；仿真；AI 写电路/压门数；流片 |
| 训练场 | 电路对战 | 每回合电路算招式功率；克制；REF 合体技 |
| 广场 | 社交 | 摸头、鱼干、牵线合体、排行 |
| 收尾 | Logo + URL | chipet.web3book.io |

## 重做

```bash
# 1) 浏览器切到「中」，截图覆盖 docs/demo-video/shots/
# 2) 旁白
say -v Tingting -r 190 -f docs/demo-video/audio/narration.txt -o docs/demo-video/audio/narration.aiff
ffmpeg -y -i docs/demo-video/audio/narration.aiff -c:a aac -b:a 192k docs/demo-video/audio/narration.m4a
# 3) 再按既有 ffmpeg 流程拼画面 + 音轨
```
