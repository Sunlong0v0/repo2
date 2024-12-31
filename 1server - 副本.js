const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs'); // 用于读写文件
const multer = require('multer');
const path = require('path'); // 引入 path 模块，用于处理文件路径
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const axios = require('axios');

const port = 3001;



app.use(express.static('public'));
app.use(express.json());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// 用户名和密码库
const usersFile = 'users.json';

// 获取用户列表
app.get('/superuser/users', (req, res) => {
    const users = readUsersFromFile();
    // 返回用户列表，不包含密码
    res.json(Object.keys(users));
});

// 读取用户数据
const readUsersFromFile = () => {
    if (fs.existsSync(usersFile)) {
        const data = fs.readFileSync(usersFile, 'utf8');
        return JSON.parse(data);
    }
    return {};
};

// 写入用户数据
const writeUsersToFile = (users) => {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
};

// 表格数据存储路径
const dataFilePath = path.join(__dirname, 'data', 'tableData.json');

// 读取表格数据
const readTableDataFromFile = () => {
    if (fs.existsSync(dataFilePath)) {
        const data = fs.readFileSync(dataFilePath, 'utf8');
        return JSON.parse(data);
    }
    return [];
};

// 写入表格数据
const writeTableDataToFile = (data) => {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
};

// 登录
const SUPER_USER_CREDENTIALS = {
    username: 'spuser',
    password: '2024'
};

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = readUsersFromFile();
    if (username === SUPER_USER_CREDENTIALS.username && password === SUPER_USER_CREDENTIALS.password) {
        req.session.user = username;
        res.json({ success: true, isSuperUser: true });
    } else if (users[username] && users[username] === password) {
        req.session.user = username;
        res.json({ success: true, isSuperUser: false });
    } else {
        res.json({ success: false, message: 'Invalid username or password' });
    }
});

// 注册
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const users = readUsersFromFile();
    if (users[username]) {
        res.json({ success: false, message: 'Username already exists' });
    } else {
        users[username] = password;
        writeUsersToFile(users);
        res.json({ success: true });
    }
});

// 注销
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            res.json({ success: false, message: 'Logout failed' });
        } else {
            res.json({ success: true });
        }
    });
});

// 上传设置
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const username = req.session.user;
        if (!username) {
            return cb(new Error('User not logged in'));
        }
        
        // 创建用户文件夹
        const userFolder = path.join('data', username);
        if (!fs.existsSync(userFolder)) {
            fs.mkdirSync(userFolder, { recursive: true });
        }

        // 计算新的 job 目录名称
        let jobNumber = 1;
        let jobFolder;
        do {
            jobFolder = path.join(userFolder, `job${jobNumber}`);
            jobNumber++;
        } while (fs.existsSync(jobFolder));

        // 创建新的 job 文件夹
        fs.mkdirSync(jobFolder);

        // 将文件保存到新的 job 文件夹
        cb(null, jobFolder);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// 提交处理
app.post('/submit', upload.single('pptFile'), (req, res) => {
    const { name, jobName, completionTime, description } = req.body;
    const username = req.session.user;
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }
    if (!username) {
        return res.status(403).send('User not logged in');
    }

    console.log('Name:', name);
    console.log('Job Name:', jobName);
    console.log('Expected Completion Time:', completionTime);
    console.log('Description:', description);

    // 保存表格数据到文件
    const timeString = new Date().toLocaleString(); // 当前时间
    const tableData = readTableDataFromFile();
    tableData.push({
        username: username,
        name: name,
        jobName: jobName,
        time: timeString,
        status: 'pending'
    });
    writeTableDataToFile(tableData);

    res.send('Form submitted successfully!');
});

// 获取表格数据
app.get('/getData', (req, res) => {
    res.json(readTableDataFromFile());
});

// 更新状态
app.post('/updateStatus', (req, res) => {
    const { username, jobName, newStatus } = req.body;

    if (!username || !jobName || !newStatus) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const data = readTableDataFromFile();
    const item = data.find(d => d.username === username && d.jobName === jobName);

    if (item) {
        item.status = newStatus;
        writeTableDataToFile(data);
        res.json({ success: true, message: 'Status updated successfully' });
    } else {
        res.status(404).json({ success: false, message: 'Item not found' });
    }
});

// 处理删除 Job 请求
app.post('/deleteJob', (req, res) => {
    const { username, jobName } = req.body;

    // 读取当前的表格数据
    const tableData = readTableDataFromFile();

    // 找到要删除的 Job 条目
    const index = tableData.findIndex(item => item.username === username && item.jobName === jobName);

    if (index !== -1) {
        // 删除条目
        tableData.splice(index, 1);
        writeTableDataToFile(tableData);
        res.json({ success: true, message: 'Job deleted successfully' });
    } else {
        res.json({ success: false, message: 'Job not found' });
    }
});

// 处理 POST 请求，保存聊天记录
const dataFilePath2 = path.join(__dirname, 'data', 'messages.json');

// 处理 GET 请求，返回聊天记录
app.get('/messages', (req, res) => {
    if (fs.existsSync(dataFilePath2)) {
        const messages = fs.readFileSync(dataFilePath2, 'utf-8');
        res.json(JSON.parse(messages));
    } else {
        res.json([]);
    }
});

app.post('/messages', (req, res) => {
    const newMessage = req.body.message;
    if (fs.existsSync(dataFilePath2)) {
        const messages = JSON.parse(fs.readFileSync(dataFilePath2, 'utf-8'));
        messages.push(newMessage);
        fs.writeFileSync(dataFilePath2, JSON.stringify(messages, null, 2));
    } else {
        fs.writeFileSync(dataFilePath2, JSON.stringify([newMessage], null, 2));
    }
    res.sendStatus(200);
});

//spuser
app.post('/superuser/manage', (req, res) => {
    const { username, password, action, targetUser, newPassword } = req.body;

    // 检查超级用户的身份
    if (username !== SUPER_USER_CREDENTIALS.username || password !== SUPER_USER_CREDENTIALS.password) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const users = readUsersFromFile();

    // 根据不同的操作执行相应的逻辑
    switch (action) {
        case 'add':
            if (users[targetUser]) {
                return res.json({ success: false, message: 'User already exists' });
            }
            users[targetUser] = newPassword;
            break;
        case 'delete':
            if (!users[targetUser]) {
                return res.json({ success: false, message: 'User does not exist' });
            }
            delete users[targetUser];
            break;
        case 'update':
            if (!users[targetUser]) {
                return res.json({ success: false, message: 'User does not exist' });
            }
            users[targetUser] = newPassword;
            break;
        default:
            return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    writeUsersToFile(users);
    res.json({ success: true, message: ')' });
});

// 读取 notes.txt 文件
app.get('/notes', (req, res) => {
    fs.readFile(path.join(__dirname, 'public', 'notes.txt'), 'utf8', (err, data) => {
        if (err) {
            res.status(500).json({ success: false, message: 'Failed to read notes.txt' });
        } else {
            res.json({ success: true, content: data });
        }
    });
});

// 更新 notes.txt 文件
app.post('/notes', (req, res) => {
    const { content } = req.body;
    fs.writeFile(path.join(__dirname, 'public', 'notes.txt'), content, 'utf8', (err) => {
        if (err) {
            res.status(500).json({ success: false, message: 'Failed to update notes.txt' });
        } else {
            res.json({ success: true, message: 'Notes updated successfully' });
        }
    });
});

// 处理 WebSocket 连接
io.on('connection', (socket) => {
    console.log('New client connected');
    socket.on('command', (command) => {
        // 这里处理终端输入的命令
        // 可以用child_process执行命令，也可以模拟返回结果
        const exec = require('child_process').exec;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                socket.emit('output', `Error: ${error.message}`);
                return;
            }
            if (stderr) {
                socket.emit('output', `Error: ${stderr}`);
                return;
            }
            socket.emit('output', stdout);
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// 下载文件的路由
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'data/examples', filename);
    res.download(filePath, (err) => {
        if (err) {
            console.error(`下载文件时出错: ${err.message}`);
            res.status(500).send('文件下载失败');
        }
    });
});

//services
const { exec } = require('child_process');
app.post('/run-script', (req, res) => {
    const userInput = req.body.input;  // 获取用户输入

    scriptOutput = ''; // 清空之前的输出
    const command = `conda activate bio && python ./public/scripts/biopython.py ${userInput}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing script: ${error.message}`);
            scriptOutput = error.message;
            return res.json({ message: 'Error running script' });
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            scriptOutput = stderr;
            return res.json({ message: 'Script executed with errors' });
        }
        console.log(`stdout: ${stdout}`);
        scriptOutput = stdout;
        res.json({ message: 'Script executed successfully' });
    });
});



app.post('/run-script2', (req, res) => {
    const userInput = req.body.input;  // 获取用户输入

    scriptOutput2 = ''; // 清空之前的输出
    const command = `conda activate bio && python ./public/scripts/pdbSearchID.py ${userInput}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing script: ${error.message}`);
            scriptOutput2 = error.message;
            return res.json({ message: 'Error running script' });
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            scriptOutput2 = stderr;
            return res.json({ message: 'Script executed with errors' });
        }
        console.log(`stdout: ${stdout}`);
        scriptOutput2 = stdout;
        res.json({ message: 'Script executed successfully' });
    });
});

app.get('/get-output', (req, res) => {
    res.json({ output: scriptOutput });
});

app.get('/get-output2', (req, res) => {
    res.json({ output2: scriptOutput2 });
});


// 读取数据
function readData(username) {
    const dataFilePath_tmp = path.join(__dirname, 'public', 'tmp', username, 'bioWebs_tmp.json');

    return new Promise((resolve, reject) => {
        fs.readFile(dataFilePath_tmp, 'utf8', (err, data) => {
            if (err) return reject(err);
            resolve(JSON.parse(data));
        });
    });
}

// 获取数据
app.get('/getData_web', async (req, res) => {
    // 定义 JSON 文件路径
    const username = req.session.user;
    const dataFilePath_web = path.join(__dirname, 'public', 'bioWebs.json');
    const dataFilePath_tmp = path.join(__dirname, 'public', 'tmp', username, 'bioWebs_tmp.json');
    // //拷贝文件
    // fs.copyFile(dataFilePath_web, dataFilePath_tmp, (err) => {
    //     if (err) {
    //         console.error('文件复制失败:', err);
    //     } else {
    //         console.log('文件复制成功');
    //     }
    // });
    // 确保文件夹存在
    async function ensureDirectoryExists(filePath) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
        }
    }

    // 复制文件（只在需要时执行，例如文件不存在时）
    async function copyFileIfNotExists() {
        try {
            await ensureDirectoryExists(dataFilePath_tmp);
            if (!fs.existsSync(dataFilePath_tmp)) {
                await fs.promises.copyFile(dataFilePath_web, dataFilePath_tmp);
                console.log('文件复制成功');
            }
        } catch (err) {
            console.error('文件复制失败:', err);
        }
    }

    // 调用复制文件函数
    await copyFileIfNotExists();

    const query = req.query.query || '';
    const items = await readData(username);
    const filteredItems = items.filter(item => item.name.includes(query) || item.description.includes(query));
    res.json(filteredItems);

});



// 写入数据
function writeData(username,items) {
    const dataFilePath_tmp = path.join(__dirname, 'public', 'tmp', username, 'bioWebs_tmp.json');

    return new Promise((resolve, reject) => {
        fs.writeFile(dataFilePath_tmp, JSON.stringify(items, null, 2), 'utf8', (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}


// 编辑条目
app.post('/editItem', async (req, res) => {
    const username = req.session.user;
    try {
        const { id, name, description, url } = req.body;
        const items = await readData(username);
        let item = items.find(item => item.id === id);
        if (item) {
            item.name = name || item.name;
            item.description = description || item.description;
            item.url = url || item.url;  // 添加对 url 属性的处理
            await writeData(username, items);
            res.status(200).send('更新成功');
        } else {
            res.status(404).send('条目未找到');
        }
    } catch (error) {
        console.error('编辑条目失败:', error);
        res.status(500).send('服务器错误');
    }
});

// 删除条目
app.post('/deleteItem', async (req, res) => {
    const username = req.session.user;

    try {
        const { id } = req.body;
        let items = await readData(username);
        items = items.filter(item => item.id !== id);
        await writeData(username,items);
        res.status(200).send('删除成功');
    } catch (error) {
        console.error('删除条目失败:', error);
        res.status(500).send('服务器错误');
    }
});

// 添加新条目
app.post('/addItem', async (req, res) => {
    const username = req.session.user;

    try {
        const { name, description, url } = req.body;
        const items = await readData(username);
        const id = (items.length + 1).toString(); // 简单的 ID 生成方式
        items.push({ id, name, description, url });
        await writeData(username,items);
        res.status(200).send('添加成功');
    } catch (error) {
        console.error('添加条目失败:', error);
        res.status(500).send('服务器错误');
    }
});




// 存储聊天历史记录
let chatHistory = [];

// 处理生成响应的请求
app.post('/api/generate', async (req, res) => {
  try {
    const response = await axios.post('http://localhost:11434/api/generate', req.body);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Error generating response' });
  }
});

// 处理聊天请求
app.post('/api/chat', async (req, res) => {
  try {
    // 添加新的消息到历史记录
    chatHistory.push(...req.body.messages);

    // 发送请求，包含整个聊天历史记录
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: req.body.model,
      messages: chatHistory
    }, {
      responseType: 'stream'
    });

    response.data.pipe(res);
  } catch (error) {
    console.error('Error chatting with model:', error);
    res.status(500).json({ error: 'Error chatting with model' });
  }
});

// 清空聊天历史记录的端点
app.post('/api/clear', (req, res) => {
  chatHistory = [];
  res.json({ message: 'Chat history cleared' });
});




// 设置存储上传文件的目录和结果文件的目录
const uploadDir = path.join(__dirname, 'uploads');
const resultDir = path.join(__dirname, 'results');

// 确保结果文件夹存在，如果不存在则创建它
if (!fs.existsSync(resultDir)) {
    fs.mkdirSync(resultDir);
}
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}


const storage2 = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads'); // 保存到 uploads 目录
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname); // 保持文件名不变
    }
});

const upload2 = multer({ storage: storage2 });

// 处理 POST /submitPDB 路由，用于接收并保存 PDB 文件
app.post('/submitPDB', upload2.single('pdbFile'), (req, res) => {
    const uploadedFile = req.file;
    if (!uploadedFile) {
        return res.status(400).send('No file uploaded.');
    }
    res.send('File uploaded successfully.');
});

// 执行 Rosetta relax命令的路由，处理 POST /run-script3
app.post('/run-script3', express.json(), (req, res) => {
    const { pdbFileName } = req.body;
    if (!pdbFileName) {
        return res.status(400).json({ message: 'No file name provided.' });
    }

    // 构建 Rosetta relax命令
    const rosettaCommand = `$ROSETTA_BIN/relax.mpi.linuxgccrelease -s ${path.join(uploadDir, pdbFileName)} -relax:constrain_relax_to_start_coords -relax:coord_constrain_sidechains -relax:ramp_constraints false -ex1 -ex2 -use_input_sc -flip_HNQ -no_optH false @./public/scripts/general_relax_flags`;

    // 执行命令
    exec(rosettaCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing command: ${error.message}`);
            return res.status(500).json({ message: 'Error executing Rosetta relaxation.' });
        }
        if (stderr) {
            console.error(`Command stderr: ${stderr}`);
            return res.status(500).json({ message: 'Rosetta command error.' });
        }
        res.json({ message: `Rosetta relaxation completed for file: ${pdbFileName}`});
    });
});

// 从results中下载文件
app.get('/run-script4/:fileName', (req, res) => {
    const fileName = req.params.fileName; // 使用 req.params 获取文件名参数
    const filePath = path.join(resultDir, `${fileName}_0001.pdb`);

    // 使用 res.download 方法来提供文件下载
    res.download(filePath, `${fileName}_0001.pdb`, (err) => {
        if (err) {
            console.error('Error downloading file:', err);
            res.status(500).send('Error downloading file.');
        }
    });
});



// 获取用户设置
app.get('/settings', (req, res) => {
    const { username } = req.query; // 从查询参数获取用户名
    const users = readUsersFromFile(); // 读取用户数据
    const password = users[username]; // 获取密码

    if (password) {
        res.json({ username: username, password: password }); // 返回用户名和密码
    } else {
        res.status(404).json({ error: '用户未找到' });
    }
});


// 修改密码
app.post('/change-password', (req, res) => {
    const { username, newPassword } = req.body; // 从请求体获取用户名和新密码
    const users = readUsersFromFile(); // 读取用户数据

    if (users[username]) {
        users[username] = newPassword; // 更新密码
        writeUsersToFile(users); // 写入更新后的用户数据
        res.json({ message: '密码已更新' });
    } else {
        res.status(404).json({ error: '用户未找到' });
    }
});


server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
