import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Bone, Cable, CalendarDays, ChevronDown, ChevronRight, CircuitBoard, Coins, Cpu, Dna, Fish, Hand, Hash, Heart, History,
  MessageCircle, Share2, Sparkles, Swords, Trophy, Unlink, User, Zap,
} from 'lucide-react';
import { Button, Empty, ErrBar, Input, KV, Meter, PAGE, Panel, Stat, Tag, cn, useMedia } from '../components/ui.tsx';
import { go } from '../router.tsx';
import { short } from '../format.ts';
import { motion } from 'motion/react';
import { PetAvatar } from '../chipet/PetAvatar.tsx';
import { ACT_ICON, actTone, rarityTone, timeAgo } from '../chipet/PetCard.tsx';
import { FxOverlay, type ChipImpulse } from '../chipet/FxOverlay.tsx';
import { LiveDie } from '../chipet/LiveDie.tsx';
import { PowerUpGame } from '../chipet/PowerUpGame.tsx';
import { fuse, heartOf } from '../chipet/heart.ts';
import { maxHpOf, MOOD_HP, MOVES, favOf } from '../chipet/battle.ts';
import { feedChipet, playChipet, readPet } from '@tapearena/chain';
import { isChainPet, localChipet, xpNeed } from '../chipet/store.ts';
import { cattributes, geneStory, phenotypeOf, typeLabel } from '../chipet/phenotype.ts';
import { maxBonds, social } from '../chipet/social.ts';
import { ShareVisitModal } from '../chipet/ShareVisitModal.tsx';
import { BEM_SKUS, bem } from '../chipet/bem.ts';
import { both, plural, tr, txt, useLang, useT } from '../i18n.ts';
import { aiPetTalk } from '../api.ts';
import { useApp } from '../state.tsx';

function fmtCd(ms: number) {
  if (ms <= 0) return '';
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? tr(`${Math.ceil(s / 60)} 分钟`, `${Math.ceil(s / 60)} min`) : tr(`${s} 秒`, `${s}s`);
}

export function PetPage({ id, share: shareToken }: { id?: number; share?: string }) {
  const t = useT();
  const lang = useLang();
  const { deployment, signer, run, notify } = useApp();
  const chipet = deployment?.chipet;
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [gameOpen, setGameOpen] = useState(false);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const [impulse, setImpulse] = useState<ChipImpulse>('idle');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [talking, setTalking] = useState(false);

  const pet = useMemo(
    () => (shareToken ? social.fromShareToken(shareToken) : id != null ? social.getByRouteId(id) : undefined),
    [id, shareToken, tick, now],
  );
  const key = pet?.key ?? '';
  const local = pet?.mine ? localChipet.get(pet.id) : undefined;
  const chainCare = !!(chipet && local && isChainPet(local));
  const bubble = txt(useMemo(() => (key ? social.bubble(key) : ''), [key, tick]));
  const notes = useMemo(() => (key ? social.notes(key) : []), [key, tick]);
  const bonds = useMemo(() => social.bonds(), [tick]);
  const pats = key ? social.patCount(key) : 0;
  const visits = key ? social.visits(key) : 0;
  const profile = social.profile();
  const recent = useMemo(() => (key ? social.activities().filter((a) => a.petKey === key).slice(0, 5) : []), [key, tick]);
  const wide = useMedia('(min-width: 640px)');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!key) return;
    social.recordVisit(key);
    setGameOpen(false);
    setTick((x) => x + 1);
  }, [key]);

  /** 牵线预览用：我最新的那只芯喵，和这位邻居串成合体电路。 */
  const lead = useMemo(() => localChipet.list()[0], [tick]);

  if (!pet) {
    return (
      <div className={cn(PAGE, 'max-w-[720px] py-16')}>
        <Panel>
          <Empty icon={Sparkles} title={t('找不到这只芯喵', "Can't find this kitty")}
            action={<Button variant="ghost" icon={ArrowLeft} onClick={() => go('/')}>{t('回家园', 'Back home')}</Button>}>
            {t('它可能已经搬走了，或者链接不完整。', 'It may have moved out, or the link is incomplete.')}
          </Empty>
        </Panel>
      </div>
    );
  }

  const ph = phenotypeOf(pet.cpu, pet.circuitId, pet.rarity);
  const heart = heartOf(pet.circuitId, pet.rarity);
  const traits = cattributes(ph);
  const feedLeft = local ? localChipet.feedCdLeft(local) : 0;
  const playLeft = local ? localChipet.playCdLeft(local) : 0;
  const mood = local?.mood ?? pet.mood;
  const energy = local?.energy ?? pet.energy;
  const intimacy = local?.intimacy ?? pet.intimacy;
  const level = local?.level ?? pet.level;
  const bonded = !pet.mine && social.isBonded(key);
  const fusion = !pet.mine && lead ? fuse(heartOf(lead.circuitId, lead.rarity), heart) : undefined;

  const flash = (msg: string) => { setOk(msg); setErr(''); setTimeout(() => setOk(''), 2600); };
  const fail = (e: unknown) => { setErr(e instanceof Error ? e.message : String(e)); setOk(''); };
  const pulse = (kind: ChipImpulse) => {
    setImpulse(kind);
    window.setTimeout(() => setImpulse('idle'), 900);
  };

  const petId = pet.id;

  const refreshFromChain = async () => {
    if (!chipet) return;
    const s = await signer();
    const on = await readPet(s.pub, chipet, petId);
    localChipet.upsertChain(on);
    setNow(Date.now());
    setTick((n) => n + 1);
  };

  const feed = () => {
    if (chainCare && chipet) {
      void run(t('喂食', 'Feed'), async (step) => {
        const s = await signer();
        await feedChipet(s, chipet, petId, step);
        await refreshFromChain();
        pulse('gift');
        flash(t('吃饱啦，呼噜呼噜~', 'All full. Purr purr~'));
      }).catch(fail);
      return;
    }
    try {
      localChipet.feed(petId);
      setNow(Date.now());
      setTick((n) => n + 1);
      pulse('gift');
      flash(t('吃饱啦，呼噜呼噜~', 'All full. Purr purr~'));
    } catch (e) { fail(e); }
  };

  const refill = () => {
    try {
      if (!bem.canAfford('energy')) {
        fail(t('BEM 不够，去商店领取或充值', 'Not enough BEM. Claim or top up in the Shop'));
        return;
      }
      bem.spendDemo('energy');
      localChipet.refillEnergy(petId);
      setNow(Date.now());
      setTick((t) => t + 1);
      pulse('happy');
      flash(t(`能量回满 · 演示扣 ${BEM_SKUS.energy.price} BEM`, `Energy full · demo −${BEM_SKUS.energy.price} BEM`));
    } catch (e) { fail(e); }
  };

  /** 通电小游戏打完三关后结算，返回给小游戏展示的奖励文案。 */
  const settlePower = (stars: number, max: number) => {
    // 任务已在 PowerUpGame 通关时 completeQuest；这里补养成结算与动态
    let summary = '';
    try {
      const r = localChipet.powerUp(petId, stars);
      const { fish } = social.recordPower(r.pet, stars, max);
      summary = t(
        `心情 +${r.mood} · 经验 +${r.xp}${r.ups ? ` · 升到 Lv.${r.pet.level}` : ''}${fish ? ' · 满星奖励鱼干 +1' : ''}`,
        `Mood +${r.mood} · XP +${r.xp}${r.ups ? ` · leveled up to Lv.${r.pet.level}` : ''}${fish ? ' · perfect bonus: +1 fish treat' : ''}`,
      );
      if (chainCare && chipet) {
        void run(t('通电玩耍', 'Power Play'), async (step) => {
          const s = await signer();
          await playChipet(s, chipet, petId, step);
          await refreshFromChain();
          notify('ok', t('通电完成', 'Power Play done'));
        }).catch(fail);
      }
    } catch (e) {
      // 冷却中等：任务进度已记，仍尽量写一条动态
      const p = localChipet.get(petId);
      if (p) {
        try { social.recordPower(p, stars, max); } catch { /* ignore */ }
      } else {
        social.completeQuest('power');
      }
      summary = e instanceof Error ? e.message : String(e);
    }
    setNow(Date.now());
    setTick((n) => n + 1);
    pulse('happy');
    return summary;
  };

  const doPat = () => {
    try {
      social.pat(key);
      setTick((t) => t + 1);
      pulse('pat');
      flash(t('它开心地蹭了蹭你', 'It nuzzles you happily'));
    } catch (e) { fail(e); }
  };

  const doGift = () => {
    try {
      social.gift(key);
      setTick((t) => t + 1);
      pulse('gift');
      flash(pet.mine
        ? t('小鱼干投喂成功', 'Fish treat delivered')
        : t(`小鱼干送到了，${pet.owner} 回访了你家`, `Fish treat delivered. ${pet.owner} came to visit you back`));
    } catch (e) { fail(e); }
  };

  const doTalk = async () => {
    if (talking) return;
    setTalking(true);
    setErr('');
    try {
      let line: { zh: string; en: string } | undefined;
      try {
        line = await aiPetTalk({
          name: pet.name,
          species: ph.species,
          vibe: ph.vibe,
          rarity: pet.rarity,
          mood,
          energy,
          intimacy,
          level,
          wins: pet.wins,
          mine: pet.mine,
          owner: pet.owner,
        });
      } catch {
        // 无后端 / 未配密钥 / 超时：回落本地台词池
      }
      social.talk(key, line ? both(line.zh, line.en) : undefined);
      setTick((t) => t + 1);
      pulse('talk');
    } catch (e) { fail(e); }
    finally { setTalking(false); }
  };

  const doBond = () => {
    try {
      social.bond(key);
      setTick((t) => t + 1);
      pulse('happy');
      flash(t(`线牵好了！对战时可以叫「${pet.name}」放合体技`, `Linked! Call on ${pet.name} for a fusion move in battle`));
    } catch (e) { fail(e); }
  };

  const doUnbond = () => {
    social.unbond(key);
    setTick((t) => t + 1);
    flash(t('已经松开这根线', 'Link removed'));
  };

  const sendNote = () => {
    try {
      social.leaveNote(key, note);
      setNote('');
      setTick((t) => t + 1);
      flash(t('留言已贴在门口', 'Note posted on the door'));
    } catch (e) { fail(e); }
  };

  const share = () => {
    setShareUrl(social.shareUrl(key));
    setShareOpen(true);
  };

  const idText = pet.key.startsWith('share:')
    ? `S-${String(Math.abs(pet.id) % 10000).padStart(4, '0')}`
    : `${pet.mine ? '#' : 'N-'}${String(Math.abs(pet.id)).padStart(4, '0')}`;
  const hp = maxHpOf(level, pet.rarity, mood);
  const genes = [
    ...traits.map((g) => ({ ...g, swatch: g.id === 'base' ? ph.body : g.id === 'eyes' ? ph.eye : undefined })),
    { id: 'species', label: t('物种', 'species'), value: ph.species, swatch: undefined },
    { id: 'vibe', label: t('气质', 'vibe'), value: ph.vibe, swatch: undefined },
  ];
  const toHeart = () => document.getElementById('heart-circuit')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={cn(PAGE, 'py-6 sm:py-8')}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <nav className="flex min-w-0 items-center gap-1.5 text-sm text-mute" aria-label={t('位置', 'Breadcrumb')}>
          <button type="button" onClick={() => go(pet.mine ? '/' : '/plaza')} className="inline-flex shrink-0 items-center gap-1.5 transition-colors hover:text-ink">
            <ArrowLeft className="size-4" /> {pet.mine ? t('家园', 'Home') : t('广场', 'Plaza')}
          </button>
          <ChevronRight className="size-3.5 shrink-0 text-faint" />
          <span className="truncate font-medium text-ink">{pet.name}</span>
        </nav>
        <button
          type="button"
          onClick={share}
          className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-br from-copper to-[#d4682f] py-1.5 pr-4 pl-1.5 text-[13px] font-semibold text-white shadow-[0_6px_16px_-4px_rgba(224,122,69,0.55)] ring-1 ring-white/25 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-6px_rgba(224,122,69,0.65)] hover:brightness-[1.03] active:translate-y-px active:scale-[0.98]"
        >
          <span className="grid size-7 place-items-center rounded-full bg-white/20 shadow-inner ring-1 ring-white/30 transition group-hover:bg-white/28">
            <Share2 className="size-3.5" strokeWidth={2.25} />
          </span>
          {t('分享撸猫链接', 'Share link')}
        </button>
      </div>

      <ShareVisitModal pet={pet} url={shareUrl} open={shareOpen} onClose={() => setShareOpen(false)} />

      {/* ── 主视觉：左边是这只猫的展示台，右边是档案与操作 ── */}
      <section className="overflow-hidden rounded-[2rem] border border-line/80 bg-panel shadow-sm shadow-si/5">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div
            className="relative isolate grid min-h-[340px] place-items-center overflow-hidden px-6 py-12 transition-[background-color] duration-700 ease-out sm:min-h-[440px] lg:min-h-[540px]"
            style={{ backgroundColor: ph.bg }}
          >
            <div className="pet-stage-grid pointer-events-none absolute inset-0 -z-10" />
            <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 aspect-square w-[82%] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 blur-2xl" />
            <span className="absolute top-5 left-5 z-20 rounded-full bg-white/80 px-3 py-1 font-mono text-xs text-ink/70 shadow-sm backdrop-blur-sm">{idText}</span>
            <span className="absolute top-5 right-5 z-20 rounded-full bg-white/80 shadow-sm backdrop-blur-sm"><Tag tone={rarityTone(pet.rarity) === 'faint' ? 'neutral' : rarityTone(pet.rarity)}>{typeLabel(pet.rarity)}</Tag></span>

            {bubble && (
              <motion.div
                className="absolute top-16 left-1/2 z-20 w-56 -translate-x-1/2 rounded-2xl bg-ink px-3 py-2 text-center text-xs text-white shadow-lg"
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                {bubble}
                <span className="absolute top-full left-1/2 -mt-px -translate-x-1/2 border-4 border-transparent border-t-ink" />
              </motion.div>
            )}
            <motion.div
              className="z-[2]"
              animate={
                impulse === 'pat' || impulse === 'happy' || impulse === 'gift'
                  ? { scale: [1, 1.06, 0.98, 1], y: [0, -6, 0] }
                  : { scale: 1, y: 0 }
              }
              transition={{ duration: 0.55, ease: 'easeOut' }}
            >
              <PetAvatar cpu={pet.cpu} circuitId={pet.circuitId} rarity={pet.rarity} mood={mood} size={wide ? 320 : 240} interactive onPat={doPat} />
            </motion.div>
            <FxOverlay impulse={impulse} />
            <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-[11px] text-ink/45">{t('点一点它 · 摸头会轻轻弹一弹', 'Tap it · a pat makes it bounce')}</p>
          </div>

          <div className="flex flex-col p-6 sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-mute">
              <span className="text-si-dim">CHIPET {idText}</span>
              <span className="text-faint">·</span>
              <span>{ph.species}</span>
              {pet.mine
                ? <Tag tone="si" className="ml-auto">{t('我的芯喵', 'My kitty')}</Tag>
                : <span className="ml-auto flex items-center gap-1.5"><User className="size-3.5 text-faint" />{t('主人', 'Owner')} <span className="font-sans font-medium text-ink">{pet.owner}</span></span>}
            </div>
            <h1 className="mt-3 text-4xl leading-tight break-words sm:text-5xl">{pet.name}</h1>
            <p className="mt-2 text-pretty text-mute">
              {t(`${ph.vibe}的${ph.species}，${ph.blurb}。`, `A ${ph.vibe} ${ph.species}. It ${ph.blurb}.`)}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label={t('等级', 'Level')} value={`Lv.${level}`} sub={local ? `${local.xp}/${xpNeed(level)} XP` : ph.species} tone="si" />
              <Stat label={t('对战体力', 'Battle HP')} value={hp} sub={mood >= 80 ? t(`心情加成 +${MOOD_HP}`, `mood bonus +${MOOD_HP}`) : t('心情 80 再加成', 'bonus at mood 80')} tone="copper" />
              <Stat label={t('战绩', 'Record')} value={local ? `${local.wins}-${local.losses}` : pet.wins} sub={local ? t('胜 - 负', 'wins - losses') : t('胜场', 'wins')} tone="gold" />
              <Stat label={t('人气', 'Popularity')} value={pats} sub={t(`次摸头 · ${visits} 次拜访`, `pats · ${plural(visits, 'visit')}`)} />
            </div>

            <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Meter icon={Zap} label={t('能量', 'Energy')} value={energy} tone="bg-copper" />
              <Meter icon={Heart} label={t('心情', 'Mood')} value={mood} tone="bg-si" />
              <Meter icon={Hand} label={t('亲密度', 'Affection')} value={Math.min(100, intimacy * 5)} text={intimacy} tone="bg-gold" />
              {local
                ? <Meter icon={Sparkles} label={t('经验', 'XP')} value={(local.xp / xpNeed(level)) * 100} text={`${local.xp}/${xpNeed(level)}`} tone="bg-[#8b7cf0]" />
                : <Meter icon={Cpu} label={t('平均功率', 'Avg power')} value={(heart.avgPower / 4) * 100} text={`${heart.avgPower.toFixed(1)} / 4`} tone="bg-[#8b7cf0]" />}
            </div>

            <div className="mt-7 flex flex-wrap gap-2.5">
              {pet.mine ? (
                <>
                  <Button size="lg" icon={Bone} disabled={feedLeft > 0} onClick={feed}>
                    {feedLeft > 0 ? t(`喂食（${fmtCd(feedLeft)}）`, `Feed (${fmtCd(feedLeft)})`) : t('喂食', 'Feed')}
                  </Button>
                  {(feedLeft > 0 || energy < 40) && (
                    <Button size="lg" variant="ghost" icon={Coins} onClick={refill}>
                      {t(`快充 ${BEM_SKUS.energy.price} BEM`, `Refill ${BEM_SKUS.energy.price} BEM`)}
                    </Button>
                  )}
                  <Button size="lg" variant="si" icon={Zap} disabled={playLeft > 0 || gameOpen} onClick={() => setGameOpen(true)}>
                    {playLeft > 0 ? t(`通电玩耍（${fmtCd(playLeft)}）`, `Power Play (${fmtCd(playLeft)})`) : t('通电玩耍', 'Power Play')}
                  </Button>
                  <Button size="lg" variant="ghost" icon={Swords} onClick={() => go(`/train?me=${petId}`)}>{t('去对战', 'Battle')}</Button>
                </>
              ) : (
                <>
                  <Button size="lg" icon={Swords} onClick={() => go(`/train?vs=${pet.id}`)}>{t('切磋一场', 'Spar')}</Button>
                  {bonded
                    ? <Button size="lg" variant="ghost" icon={Cable} onClick={() => document.getElementById('fusion')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{t('已牵线 · 看合体电路', 'Linked · view fusion')}</Button>
                    : <Button size="lg" variant="si" icon={Cable} disabled={!lead} onClick={doBond}>{t('牵线（1 鱼干）', 'Link (1 treat)')}</Button>}
                </>
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" icon={Hand} disabled={!social.canPat(key)} onClick={doPat}>
                {social.canPat(key) ? t('摸头杀', 'Pat') : t('今日已摸', 'Patted today')}
              </Button>
              <Button size="sm" variant="ghost" icon={Fish} disabled={!social.canGift(key)} onClick={doGift}>{t('送鱼干', 'Give fish')}</Button>
              <Button size="sm" variant="ghost" icon={MessageCircle} disabled={talking} onClick={() => void doTalk()}>
                {talking ? t('想着…', 'Thinking…') : t('说话', 'Talk')}
              </Button>
              <span className="ml-auto flex items-center gap-1.5 font-mono text-xs text-mute"><Fish className="size-3.5 text-si" />{t(`我的鱼干 ${profile.fish}`, `${plural(profile.fish, 'fish treat')} left`)}</span>
            </div>

            <div className="mt-3 min-h-10" aria-live="polite">
              {err
                ? <div className="overflow-hidden rounded-2xl"><ErrBar>{err}</ErrBar></div>
                : ok && <p className="animate-rise rounded-2xl bg-si/10 px-3.5 py-2 text-sm text-si-dim">{ok}</p>}
            </div>

            <button type="button" onClick={toHeart}
              className="group mt-auto flex items-center gap-3 rounded-2xl bg-[#14231f] px-4 py-3 text-left transition hover:bg-[#1b302a]">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-copper-hi"><Cpu className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[11px] text-[#8fb3a5]">HEART · TapeOut circuit #{pet.circuitId.toString()}</span>
                <span className="block truncate text-sm font-semibold text-white">
                  {heart.name} · {t(`${heart.gates} 门 · ${heart.nIn} 进 ${heart.nOut} 出 · ${heart.style}`, `${heart.gates} gates · ${heart.nIn} in / ${heart.nOut} out · ${heart.style}`)}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-[#8fb3a5] transition-transform group-hover:translate-y-0.5" />
            </button>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {gameOpen && pet.mine && (
            <PowerUpGame heart={heart} petName={pet.name} onFinish={settlePower} onClose={() => setGameOpen(false)} />
          )}

          <div id="heart-circuit" className="scroll-mt-24">
            <Panel title={t(`心脏电路 · ${heart.name}`, `Heart circuit · ${heart.name}`)} icon={CircuitBoard} bodyClass="p-5 sm:p-6"
              right={<Tag tone="copper" icon={Cpu}>{t(`${heart.gates} 个 NAND 门`, `${heart.gates} NAND gates`)}</Tag>}>
              <p className="text-sm leading-relaxed text-pretty text-mute">{geneStory(ph, heart.gates)}</p>
              <div className="mt-4">
                <LiveDie circuit={heart} label={t(`${heart.name} · 实时仿真`, `${heart.name} · live simulation`)} height={wide ? 260 : 200} />
              </div>
              <p className="mt-2 text-xs text-faint">
                {t(
                  `${heart.name}：${heart.tagline}。铜色方块是一个个 NAND 门，亮起来的是这一拍通了电的。`,
                  `${heart.name}: ${heart.tagline}. Each copper block is a NAND gate; the lit ones are powered on this tick.`,
                )}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Stat label={t('逻辑门', 'Gates')} value={heart.gates} tone="copper" />
                <Stat label={t('引脚', 'Pins')} value={t(`${heart.nIn} 进 ${heart.nOut} 出`, `${heart.nIn} in / ${heart.nOut} out`)} />
                <Stat label={t('逻辑深度', 'Depth')} value={heart.depth} />
                <Stat label={t('平均功率', 'Avg power')} value={heart.avgPower.toFixed(1)} tone="gold" />
                <Stat label={t('出力风格', 'Style')} value={heart.style} tone="si" />
                <Stat label={t('对战体力', 'Battle HP')} value={hp} />
                <Stat label={t('偏爱招式', 'Favorite move')} value={MOVES[favOf(ph.speciesId)]!.name} />
                <Stat label={t('电路 ID', 'Circuit ID')} value={`#${pet.circuitId.toString()}`} />
              </div>
              <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-panel-2/70 p-3.5 text-xs leading-relaxed text-mute">
                <Heart className="mt-0.5 size-3.5 shrink-0 text-si" />
                <span>
                  {t(
                    '外形和心脏都由电路身份派生，同一枚电路永远长一样、算出一样的结果。通电玩耍和对战里的每一步，都是这张网表逐门算出来的。',
                    'Looks and heart are both derived from the circuit\'s identity: the same circuit always looks the same and computes the same results. Every step of Power Play and battle is evaluated gate by gate on this netlist.',
                  )}
                </span>
              </div>
            </Panel>
          </div>

          {!pet.mine && (
            <div id="fusion" className="scroll-mt-24">
              <Panel title={t('牵线 · 合体电路', 'Link · fusion circuit')} icon={Cable} bodyClass="p-5 sm:p-6"
                right={<span className="font-mono text-[11px] text-mute">{t('线友', 'Wire pals')} {bonds.length}/{maxBonds()}</span>}>
                {!lead ? (
                  <p className="text-sm text-mute">{t(`先在家园孵一只芯喵，才能和「${pet.name}」牵线。`, `Hatch a kitty at Home first, then you can link up with ${pet.name}.`)}</p>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-pretty text-mute">
                      {lang === 'zh' ? (
                        <>TapeOut 的电路可以互相引用。{bonded ? '你们已经牵了线' : '牵线之后'}：「{lead.name}」的{fusion!.a.name}把输出接进「{pet.name}」的{heart.name}，两颗心脏串成一枚 <b className="font-semibold text-ink">{fusion!.a.gates} + {heart.gates} = {fusion!.gates} 门</b>的合体电路。对战时每场能放一次合体技，无视克制。</>
                      ) : (
                        <>TapeOut circuits can reference each other. {bonded ? 'You two are linked' : 'Once you link up'}: {lead.name}'s {fusion!.a.name} feeds its outputs into {pet.name}'s {heart.name}, wiring the two hearts into a fusion circuit of <b className="font-semibold text-ink">{fusion!.a.gates} + {heart.gates} = {fusion!.gates} gates</b>. Once per battle it lets you fire a fusion move that ignores the move triangle.</>
                      )}
                    </p>
                    {bonded && (
                      <div className="mt-4">
                        <LiveDie circuit={fusion!} label={t(`${fusion!.a.name} ⟶ ${heart.name} · 合体`, `${fusion!.a.name} ⟶ ${heart.name} · fusion`)} height={170} />
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {bonded ? (
                        <>
                          <Button icon={Swords} onClick={() => go('/train')}>{t('带它去对战', 'Take it to battle')}</Button>
                          <Button variant="ghost" icon={Unlink} onClick={doUnbond}>{t('松开这根线', 'Unlink')}</Button>
                        </>
                      ) : (
                        <Button variant="si" icon={Cable} onClick={doBond}>{t('牵线（1 鱼干）', 'Link (1 treat)')}</Button>
                      )}
                    </div>
                  </>
                )}
              </Panel>
            </div>
          )}

          <Panel title={t('访客留言板', 'Guestbook')} icon={MessageCircle} bodyClass="p-5 sm:p-6"
            right={<span className="font-mono text-[11px] text-mute">{t(`${notes.length} 条`, plural(notes.length, 'note'))}</span>}>
            <div className="flex gap-2">
              <Input
                className="min-w-0 flex-1"
                value={note}
                maxLength={60}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                placeholder={t('夸一句、约对战、求摸头…', 'Say something nice, ask for a battle, beg for a pat…')}
                onChange={(e) => setNote(e.target.value.slice(0, 60))}
                onPaste={(e) => {
                  // 粘贴也裁到上限，避免一次塞入超长载荷
                  const clip = e.clipboardData.getData('text/plain');
                  if (!clip) return;
                  e.preventDefault();
                  const next = `${note}${clip}`.slice(0, 60);
                  setNote(next);
                }}
                onKeyDown={(e) => e.key === 'Enter' && sendNote()}
              />
              <Button disabled={!note.trim()} onClick={sendNote}>{t('留言', 'Post')}</Button>
            </div>
            <p className="mt-2 text-[11px] text-faint">
              {t('禁止链接与敏感词；发送有频率限制。', 'No links or blocked words; posting is rate-limited.')}
            </p>
            <ul className="mt-4 space-y-2.5">
              {notes.length === 0 ? (
                <li className="rounded-2xl bg-panel-2/50 py-8 text-center text-sm text-mute">{t('还没有留言，来做第一个访客吧。', 'No notes yet. Be the first visitor.')}</li>
              ) : notes.map((n) => (
                <li key={n.id} className="flex gap-3 rounded-2xl bg-panel-2/60 px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-panel font-display text-sm font-bold text-si ring-1 ring-line">{txt(n.from).slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{txt(n.from)}</span>
                      <span className="shrink-0 text-[11px] text-faint">{new Date(n.at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-pretty text-mute">{txt(n.text)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* ── 侧栏：基因、档案、线友、动态 ── */}
        <aside className="flex min-w-0 flex-col gap-6">
          <Panel title={t('外形基因 · Cattributes', 'Cattributes')} icon={Dna} bodyClass="p-4">
            <ul className="grid grid-cols-2 gap-2">
              {genes.map((g) => (
                <li key={g.id} className="min-w-0 rounded-2xl bg-panel-2/70 px-3.5 py-2.5">
                  <div className="font-mono text-[11px] text-faint">{g.label}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {g.swatch && <span className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: g.swatch }} />}
                    <span className="truncate">{g.value}</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 px-1 text-xs text-pretty text-faint">
              {t('毛色、瞳色和花纹由处理器地址与电路 ID 哈希得出：同一枚电路，永远是同一张脸。', 'Coat, eyes and pattern are hashed from the processor address and circuit ID: the same circuit always gets the same face.')}
            </p>
          </Panel>

          <Panel title={t('档案', 'Profile')} icon={Hash} bodyClass="p-5">
            <KV rows={[
              [Hash, t('编号', 'ID'), idText],
              [User, t('主人', 'Owner'), <span className="font-sans">{pet.owner}</span>],
              [CircuitBoard, t('电路 ID', 'Circuit ID'), `#${pet.circuitId.toString()}`],
              [Cpu, t('处理器', 'Processor'), <span title={pet.cpu}>{short(pet.cpu, 6)}</span>],
              ...(local ? [[CalendarDays, t('孵化于', 'Hatched'), new Date(local.hatchedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US')] as [typeof Hash, string, string]] : []),
              [Trophy, t('战绩', 'Record'), local ? t(`${local.wins} 胜 ${local.losses} 负`, `${local.wins} W / ${local.losses} L`) : t(`${pet.wins} 胜`, plural(pet.wins, 'win'))],
              [Heart, t('拜访', 'Visits'), visits],
              [Hand, t('被摸', 'Pats'), pats],
            ]} />
          </Panel>

          {pet.mine && (
            <Panel title={t('线友', 'Wire pals')} icon={Cable} bodyClass="p-4"
              right={<span className="font-mono text-[11px] text-mute">{bonds.length}/{maxBonds()}</span>}>
              {bonds.length === 0 ? (
                <div className="px-1 py-2 text-sm text-pretty text-mute">
                  {t('还没有线友。去广场找邻居牵线，两颗心脏串成合体电路，对战时能放合体技。', 'No wire pals yet. Link up with a neighbor in the Plaza: two hearts wired into one fusion circuit unlock a fusion move in battle.')}
                  <div className="mt-3"><Button size="sm" variant="ghost" icon={Cable} onClick={() => go('/plaza')}>{t('去广场牵线', 'Find a pal in the Plaza')}</Button></div>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {bonds.map((b) => {
                    const bh = heartOf(b.circuitId, b.rarity);
                    return (
                      <li key={b.key}>
                        <button type="button" onClick={() => go(`/pet/${b.id}`)}
                          className="flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-panel-2/70">
                          <PetAvatar cpu={b.cpu} circuitId={b.circuitId} rarity={b.rarity} mood={b.mood} size={40} lively={false} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">{b.name}</span>
                            <span className="block truncate font-mono text-[11px] text-mute">{bh.name} · {t(`合体 ${fuse(heart, bh).gates} 门`, `fusion: ${fuse(heart, bh).gates} gates`)}</span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-faint" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          )}

          <Panel title={t('最近动态', 'Recent activity')} icon={History} bodyClass="p-4">
            {recent.length === 0 ? (
              <p className="px-1 py-2 text-sm text-mute">{t('这只芯喵还没有动态。摸摸它、送条鱼干试试。', 'No activity for this kitty yet. Try a pat or a fish treat.')}</p>
            ) : (
              <ul className="space-y-3">
                {recent.map((a) => {
                  const I = ACT_ICON[a.kind] ?? Sparkles;
                  return (
                    <li key={a.id} className="flex items-start gap-3">
                      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl', actTone(a.kind))}><I className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-pretty text-ink">{txt(a.text)}</span>
                        <span className="block text-[11px] text-faint">{txt(a.actor)} · {timeAgo(a.at)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
