'use client';
import {RANK_TIERS as TIERS,rankProgress} from '@/lib/rank-display.mjs';

export function TierBadge({tier,decorative=false,className=''}:{tier:string;decorative?:boolean;className?:string}) {
  const rank=TIERS.find(t=>t.id===tier) || TIERS[0];
  return <img className={`tier-badge ${className}`} src={`/ranks/${rank.id}.webp`} width={300} height={300} alt={decorative?'':`${rank.label} tier`} draggable={false}/>;
}

export default function RankStanding({rating,played}:{rating:number;played:number}) {
  const {tier,next,remaining,fraction}=rankProgress(rating);
  return <section className="rank-standing" aria-label="Your rank">
    <div className="rank-hero"><TierBadge tier={tier.id} decorative/><div className="rank-tier-name">{tier.label}</div></div>
    <div className="rank-rating"><strong>{rating.toLocaleString()}</strong><span>Rating</span></div>
    <div className="rank-progress" role="progressbar" aria-label={next?`Progress to ${next.label}`:'Diamond tier reached'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction*100)} aria-valuetext={next?`${remaining} rating to ${next.label}`:'Highest tier reached'}><span style={{width:`${fraction*100}%`}}/></div>
    <p className="rank-progress-caption"><span>{next?<><b>{remaining}</b> to {next.label}</>:'The highest table. Keep climbing.'}</span><span>{played} played</span></p>
    <ol className="rank-tier-rail" aria-label="Ranked tiers">{TIERS.map(t=><li key={t.id} aria-current={t.id===tier.id?'step':undefined} title={`${t.label} · ${t.floor}+ rating`}><TierBadge tier={t.id} decorative/><span>{t.label}</span></li>)}</ol>
  </section>;
}
