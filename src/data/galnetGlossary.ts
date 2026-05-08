export type GalnetGlossaryEntry = {
  aliases?: string[]
  category:
    | 'activity'
    | 'artifact'
    | 'combat'
    | 'facility'
    | 'faction'
    | 'game-mechanic'
    | 'location'
    | 'media'
    | 'organization'
    | 'phenomenon'
    | 'politics'
    | 'profession'
    | 'ship'
    | 'species'
    | 'technology'
    | 'travel'
  explanationZh: string
  id: string
  preferredZh: string
  term: string
  translationPolicy: 'first_mention_bilingual' | 'translate'
}

export const galnetGlossary: GalnetGlossaryEntry[] = [
  {
    id: 'galnet',
    term: 'Galnet',
    aliases: ['Galnet News'],
    preferredZh: 'Galnet（银河新闻网络）',
    category: 'media',
    translationPolicy: 'first_mention_bilingual',
    explanationZh: '游戏内的新闻网络与新闻栏目名，也是官方叙事主渠道之一。'
  },
  {
    id: 'pilots-federation',
    term: 'Pilots Federation',
    preferredZh: 'Pilots Federation（飞行员组织）',
    category: 'organization',
    translationPolicy: 'first_mention_bilingual',
    explanationZh: '宇宙中的独立飞行员组织，也是 Galnet 等公共信息系统的重要制度背景。'
  },
  {
    id: 'federation',
    term: 'Federation',
    aliases: ['Feds'],
    preferredZh: '联邦',
    category: 'faction',
    translationPolicy: 'translate',
    explanationZh: '人类主要超级势力之一，Galnet 里常作为政治、军事和公共事件的行动方出现。'
  },
  {
    id: 'empire',
    term: 'Empire',
    aliases: ['Imps'],
    preferredZh: '帝国',
    category: 'faction',
    translationPolicy: 'translate',
    explanationZh: '人类主要超级势力之一，常与联邦、联盟并列出现。'
  },
  {
    id: 'alliance',
    term: 'Alliance',
    preferredZh: '联盟',
    category: 'faction',
    translationPolicy: 'translate',
    explanationZh: '人类主要超级势力之一，需要结合上下文区分泛指联盟还是专指独立星系联盟。'
  },
  {
    id: 'superpower',
    term: 'Superpower',
    preferredZh: '超级势力',
    category: 'politics',
    translationPolicy: 'translate',
    explanationZh: '通常指联邦、帝国、联盟这类银河级政治实体。'
  },
  {
    id: 'faction',
    term: 'Faction',
    preferredZh: '派系',
    category: 'politics',
    translationPolicy: 'translate',
    explanationZh: 'Galnet 和 BGS 语境里的基础政治单位，可指地方派系，也可放宽到阵营语境。'
  },
  {
    id: 'minor-faction',
    term: 'Minor Faction',
    aliases: ['PMF'],
    preferredZh: '小型派系',
    category: 'politics',
    translationPolicy: 'translate',
    explanationZh: 'BGS 中控制具体星系和空间站的地方派系，不等同于联邦、帝国、联盟等超级势力。'
  },
  {
    id: 'influence',
    term: 'Influence',
    preferredZh: '影响力',
    category: 'game-mechanic',
    translationPolicy: 'translate',
    explanationZh: 'BGS 里衡量派系在某个星系中控制力变化的关键指标。'
  },
  {
    id: 'background-simulation',
    term: 'Background Simulation',
    aliases: ['BGS'],
    preferredZh: '背景模拟',
    category: 'game-mechanic',
    translationPolicy: 'translate',
    explanationZh: '控制银河经济与政治状态变化的底层系统，玩家社区通常简称 BGS。'
  },
  {
    id: 'powerplay',
    term: 'Powerplay',
    preferredZh: 'Powerplay（势力博弈）',
    category: 'game-mechanic',
    translationPolicy: 'first_mention_bilingual',
    explanationZh: '围绕银河级政治力量展开的玩法和叙事层概念。'
  },
  {
    id: 'community-goal',
    term: 'Community Goal',
    aliases: ['CG'],
    preferredZh: '社区目标',
    category: 'activity',
    translationPolicy: 'translate',
    explanationZh: '社区协作活动名词，Galnet 和玩家社区里经常直接写作 CG。'
  },
  {
    id: 'thargoid',
    term: 'Thargoid',
    preferredZh: 'Thargoid（萨戈伊德）',
    category: 'species',
    translationPolicy: 'first_mention_bilingual',
    explanationZh: 'Elite Dangerous 里的主要外星威胁，正式翻译更适合保留英文或音译。'
  },
  {
    id: 'anti-xeno',
    term: 'Anti-Xeno',
    aliases: ['AX', 'Anti Xeno'],
    preferredZh: '反异种',
    category: 'combat',
    translationPolicy: 'translate',
    explanationZh: '针对 Thargoid 相关威胁的作战和装备语汇，社区常简称 AX。'
  },
  {
    id: 'guardian',
    term: 'Guardian',
    preferredZh: '守护者',
    category: 'species',
    translationPolicy: 'translate',
    explanationZh: '古代外星文明，Galnet 语境中常与遗物、遗迹和反 Thargoid 技术相关。'
  },
  {
    id: 'guardian-artefact',
    term: 'Guardian Artefact',
    aliases: ['Guardian Artifact'],
    preferredZh: '守护者遗物',
    category: 'artifact',
    translationPolicy: 'translate',
    explanationZh: '与守护者文明相关的遗物和研究对象，Galnet 标题里经常直接出现。'
  },
  {
    id: 'maelstrom',
    term: 'Maelstrom',
    aliases: ['Maelstroms'],
    preferredZh: 'Maelstrom（异种漩涡体）',
    category: 'phenomenon',
    translationPolicy: 'first_mention_bilingual',
    explanationZh: '与 Thargoid 活动相关的大型异常现象，是近年叙事的重要背景。'
  },
  {
    id: 'inra',
    term: 'INRA',
    preferredZh: 'INRA（反异种秘密机构）',
    category: 'organization',
    translationPolicy: 'first_mention_bilingual',
    explanationZh: '与 Thargoid 相关历史事件密切相连的秘密机构，常出现在旧战争与实验背景里。'
  },
  {
    id: 'system',
    term: 'System',
    aliases: ['Star System', 'Systems'],
    preferredZh: '星系',
    category: 'location',
    translationPolicy: 'translate',
    explanationZh: 'Galnet 最常见的空间地理单位，新闻里常与袭击、贸易、科研或政治事件绑定。'
  },
  {
    id: 'station',
    term: 'Station',
    preferredZh: '空间站',
    category: 'facility',
    translationPolicy: 'translate',
    explanationZh: '对各类可停靠设施的宽泛称呼，语义上大于 starport 和 outpost。'
  },
  {
    id: 'starport',
    term: 'Starport',
    aliases: ['Starports'],
    preferredZh: '星港',
    category: 'facility',
    translationPolicy: 'translate',
    explanationZh: '可停靠舰船的主要空间站设施，与 outpost 相比更适合表示大型港站。'
  },
  {
    id: 'outpost',
    term: 'Outpost',
    aliases: ['Outposts'],
    preferredZh: '前哨站',
    category: 'facility',
    translationPolicy: 'translate',
    explanationZh: '轨道设施的一种，停靠能力通常低于大型星港。'
  },
  {
    id: 'installation',
    term: 'Installation',
    aliases: ['Installations'],
    preferredZh: '轨道设施',
    category: 'facility',
    translationPolicy: 'translate',
    explanationZh: '更偏向无停靠能力的功能性轨道结构，不同于可停靠的星港和前哨站。'
  },
  {
    id: 'settlement',
    term: 'Settlement',
    aliases: ['Settlements'],
    preferredZh: '定居点',
    category: 'facility',
    translationPolicy: 'translate',
    explanationZh: '地表或区域性聚居设施，比 outpost 和 starport 更泛，也更适合地面语境。'
  },
  {
    id: 'tourist-beacon',
    term: 'Tourist Beacon',
    aliases: ['Tourist Beacons'],
    preferredZh: '旅游信标',
    category: 'facility',
    translationPolicy: 'translate',
    explanationZh: '提供历史或地点信息的扫描点，常与 lore 和事件地点相关。'
  },
  {
    id: 'megaship',
    term: 'Megaship',
    aliases: ['Megaships'],
    preferredZh: '巨型舰船',
    category: 'ship',
    translationPolicy: 'translate',
    explanationZh: '比一般舰船更大型的舰船类别，许多 lore 事件和远征都围绕这类舰船展开。'
  },
  {
    id: 'generation-ship',
    term: 'Generation Ship',
    aliases: ['Generation Ships'],
    preferredZh: '世代舰',
    category: 'ship',
    translationPolicy: 'translate',
    explanationZh: '在超光速旅行普及前进行长期航行、以多代人生活为前提的巨型舰船。'
  },
  {
    id: 'fleet-carrier',
    term: 'Fleet Carrier',
    aliases: ['Fleet Carriers', 'FC'],
    preferredZh: '舰队航母',
    category: 'ship',
    translationPolicy: 'translate',
    explanationZh: '大型可部署舰船平台，Galnet 常把它放在远征、后勤和补给语境中。'
  },
  {
    id: 'engineer',
    term: 'Engineer',
    aliases: ['Engineering'],
    preferredZh: '工程师',
    category: 'profession',
    translationPolicy: 'translate',
    explanationZh: '可指职业角色，也可指游戏里的改装体系相关角色，需要结合上下文判断。'
  },
  {
    id: 'frame-shift-drive',
    term: 'Frame Shift Drive',
    aliases: ['FSD', 'Frame Shift Drives'],
    preferredZh: '帧移跃迁驱动器',
    category: 'technology',
    translationPolicy: 'translate',
    explanationZh: '游戏里最核心的跃迁推进装置，社区和资料中通常直接简称 FSD。'
  },
  {
    id: 'hyperspace',
    term: 'Hyperspace',
    preferredZh: '超空间',
    category: 'travel',
    translationPolicy: 'translate',
    explanationZh: '星系间跃迁时所处的空间状态，常与跳跃、异常信号和遭遇事件相关。'
  },
  {
    id: 'supercruise',
    term: 'Supercruise',
    aliases: ['Supercruise Assist'],
    preferredZh: '超巡航',
    category: 'travel',
    translationPolicy: 'translate',
    explanationZh: '星系内高速飞行状态，常与拦截、接近目标和航行辅助相关。'
  }
]
