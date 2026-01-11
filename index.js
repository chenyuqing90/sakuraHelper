// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits } = require('discord.js');

// 優先使用環境變數，本地開發才用 config.json
const token = process.env.DISCORD_TOKEN || require('./config.json').token;

const cron = require('node-cron');

// Create a new client instance
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions  // 如果需要追蹤反應(可選)
  ] 
});

// 日語交流群
// 一般      1456478177496141932
const regularChannelId = '1456478177496141932';
// 點名區    1456524636027093164
const rollCallChannelId = '1456524636027093164';
// 任務計劃區 1456522123286810799
const taskChannelId = '1456522123286810799';

// 機器人啟動
client.once(Events.ClientReady, async (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);

  // 方法 1: 使用特定伺服器 ID（推薦）
  const guildId = '1456478177496141927'; // 你的日語交流群 ID
  const guild = readyClient.guilds.cache.get(guildId);
  
  if (!guild) {
    console.error('找不到指定的伺服器');
    return;
  }
  
  // 啟動後立即執行檢查
  await checkForumActivity(guild, taskChannelId);
});

// 每週日晚上 10 點執行檢查
// cron.schedule('0 22 * * 0', () => {
//   const guild = client.guilds.cache.first();
//   checkForumActivity(guild, taskChannelId);
// }, {
//   timezone: "Asia/Taipei"
// });

async function checkForumActivity(guild, forumChannelId) {
  try {
    const forumChannel = await guild.channels.fetch(forumChannelId);
    
    if (!forumChannel || !forumChannel.isThreadOnly()) {
      console.error('指定的頻道不是論壇頻道');
      return;
    }

    // 獲取一週前的時間
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 6);

    // 先載入所有成員（重要！）
    await guild.members.fetch();
    console.log(`伺服器總成員數: ${guild.memberCount}`);

    // 獲取所有貼文(threads)
    const threads = await forumChannel.threads.fetchActive();
    const archivedThreads = await forumChannel.threads.fetchArchived();
    const allThreads = new Map([...threads.threads, ...archivedThreads.threads]);

    // 過濾出過去一週的貼文
    const recentThreads = Array.from(allThreads.values()).filter(thread => 
      thread.createdTimestamp > oneWeekAgo.getTime()
    );

    // 獲取所有能看到此頻道的成員
    const allMembers = guild.members.cache.filter(member => 
      !member.user.bot && 
      forumChannel.permissionsFor(member).has('ViewChannel')
    );
    console.log(`總共有 ${allMembers.size} 位成員可以看到此頻道`);

    // 追蹤發過貼文和留過言的成員
    const membersWhoPosted = new Set();
    const membersWhoCommented = new Set();

    // 檢查每個貼文
    for (const thread of recentThreads) {
      // 貼文作者
      membersWhoPosted.add(thread.ownerId);

      // 獲取貼文中的所有留言
      const messages = await thread.messages.fetch({ limit: 100 });
      messages.forEach(msg => {
        if (!msg.author.bot) {
          membersWhoCommented.add(msg.author.id);
        }
      });
    }

    // 找出沒發貼文也沒留言的成員(兩者都沒做到)
    const inactiveMembers = Array.from(allMembers.values()).filter(member => 
      !membersWhoPosted.has(member.id) && !membersWhoCommented.has(member.id)
    );

    // 格式化日期
    const startDate = oneWeekAgo.toLocaleDateString('zh-TW', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const endDate = new Date().toLocaleDateString('zh-TW', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // 建立報告
    let report = `各位，${startDate} ~ ${endDate} 尚未在 <#${taskChannelId}> 發佈貼文＆打卡的朋友：\n`;
    
    if (inactiveMembers.length > 0) {
      inactiveMembers.forEach(member => {
        report += `<@${member.id}>\n`;
      });
    } else {
      report += `（無）\n`;
    }
    
    report += `\n新的一週還讓我們一起加油！`;

    // 發送報告到指定頻道（測試期間註解）
    // const regularChannel = await guild.channels.fetch(regularChannelId);
    // const rollCallChannel = await guild.channels.fetch(rollCallChannelId);
    // await regularChannel.send(report);
    // await rollCallChannel.send(report);
    
    // 測試階段先輸出到控制台
    console.log('=== 報告內容 ===');
    console.log(report);
    console.log('================');
    console.log(`本週共有 ${recentThreads.length} 篇貼文`);
    console.log(`未活躍成員: ${inactiveMembers.length} 人`);

  } catch (error) {
    console.error('檢查論壇活躍度時發生錯誤:', error);
  }
}

// Log in to Discord with your client's token
client.login(token);