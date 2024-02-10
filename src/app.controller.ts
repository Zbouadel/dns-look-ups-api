import { Controller } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs'

// CommandQueue class to handle concurrency
class CommandQueue {
  private queue: (() => Promise<void>)[] = []; // Queue of commands
  private runningCount = 0; // Number of commands currently running
  private concurrencyLimit: number; // Maximum number of commands allowed to run concurrently

  constructor(concurrencyLimit: number) {
      this.concurrencyLimit = concurrencyLimit;
  }

  // Add command to the queue
  async addCommand(command: () => Promise<void>) {
      this.queue.push(command);
      await this.processQueue();
  }

  // Process commands from the queue
  private async processQueue() {
      while (this.runningCount < this.concurrencyLimit && this.queue.length > 0) {
          const command = this.queue.shift(); // Get the next command from the queue
          if (command) {
              this.runningCount++; // Increment running count
              await command(); // Execute the command
              this.runningCount--; // Decrement running count after execution
          }
      }
  }
}

// Function to perform DNS text lookup
const extractDnsTextLookUp = async (domaine: string): Promise<string | null> => {
  return new Promise<string | null>((resolve, reject) => {
    const process = spawn('dig', ['-t', 'txt', domaine]);

    let stdoutData = '';

    // Capture stdout data
    process.stdout.on('data', (data) => {
        stdoutData += data.toString();
    });
    
    // Handle errors
    process.on('error', (error) => {
        reject(error);
    });
    
    // Process close event
    process.on('close', (code) => {
        if (code === 0) {
            resolve(stdoutData); // Resolve with stdout data if process exits successfully
        } else {
            reject(new Error(`dig command exited with code ${code}`)); // Reject with error otherwise
        }
    });
  });
}

@Controller()
export class AppController {
  private commandQueue: CommandQueue;

  constructor(
  ) {
      this.commandQueue = new CommandQueue(100); // Initialize command queue with concurrency limit of 100
  }

  // Function to export Domaines fron the file content "id","domaine","rank"
  async convertFileToJsonArray(filePath: string): Promise<void> {
    const textFileContent = fs.readFileSync(filePath).toString('utf-8');
    textFileContent.split('\n').map((line) => {
      line = line.replaceAll('"', '')?.split(',')[1] // Remove quotes and split lines
      this.lookForIpAddress(line) // Call lookForIpAddress for each line
    });
  }

  // Function to look for IP address in DNS
  async lookForIpAddress(domaine: string) {
    const urlRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/

    // Skip if the input is not a valide email
    if (urlRegex.test(domaine)) return;

    await this.commandQueue.addCommand(async () => { // Add command to command queue
      try {
        const rawResult = await extractDnsTextLookUp(domaine); // Perform DNS lookup
        if (!rawResult) return;
        let spfLine = rawResult.split('\n').filter((line) => {
          return line.includes('v=spf1');
        })[0];

        if (spfLine && spfLine.includes(' include:' || ' +include:')) {
          let splitedLine = spfLine.includes(' +include:') ? spfLine.split(' +include:') : spfLine.split(' include:');
          splitedLine[splitedLine?.length - 1] = splitedLine[splitedLine?.length - 1].split(' ')[0].replaceAll('"','');
          splitedLine.shift();
          if (splitedLine.length > 0) {
            splitedLine.map(async (adress) => {
              this.lookForIpAddress(adress); // Recursively look for IP address
              // save lookup result
              this.saveLookUp({
                domaine: adress,
                spf: splitedLine,
                parent: domaine,
                ips: [],
              });
            });
          }
          return;
        } else if (spfLine && spfLine.includes(' redirect=' || ' +redirect=')) {
          let splitedLine = spfLine.includes(' +redirect=') ? spfLine.split(' +redirect=') : spfLine.split(' redirect=');

          splitedLine[splitedLine?.length - 1] = splitedLine[splitedLine?.length - 1].split(' ')[0].replaceAll('"','');
          splitedLine.shift();
          if (splitedLine.length > 0) {
            splitedLine.map(async (adress) => {
              this.lookForIpAddress(adress); // Recursively look for IP address
              // save lookup result
              this.saveLookUp({
                domaine: adress,
                spf: splitedLine,
                parent: domaine,
                ips: [],
              });
            });
          }
          return;
        } else if (spfLine && spfLine.includes('ip4' || '+ip4')) {
          let splitedLine = spfLine.includes('+ip4') ? spfLine.split(' +ip4:') : spfLine.split(' ip4:');
          splitedLine[splitedLine?.length - 1] = splitedLine[splitedLine?.length - 1].split(' ')[0];
          splitedLine.shift();
          // save lookup result
          this.saveLookUp({
            domaine: '',
            spf: "",
            parent: domaine,
            ips: [...splitedLine],
          });
          return;
        } else if (spfLine && spfLine.includes('ip6' || '+ip6')) {
          let splitedLine = spfLine.includes('+ip6') ? spfLine.split(' +ip6:') : spfLine.split(' ip6:');
          splitedLine[splitedLine?.length - 1] = splitedLine[splitedLine?.length - 1].split(' ')[0];
          splitedLine.shift();
          // save lookup result
          this.saveLookUp({
            domaine: '',
            spf: "",
            parent: domaine,
            ips: [...splitedLine],
          });
          return;
        }
      } catch (error) {
        console.error('Error during DNS lookup:', error);
      }
    });
  }

  async saveLookUp(data) {
    // console.log("🚀 ~ AppController ~ saveLookUp ~ data:", data)
    // Save The rRecord to json File
    this.addRecord(data)
    // const lookup = await new this.dnsLookUpsModel(data);
    // lookup.save();
  }

  fileFilter = (req, file, callback) => {
    if (!file.originalname.match(/\.(txt)$/)) {
      return callback(new Error('Only txt files are allowed!'), false);
    }
    callback(null, true);
  };


  readData(): any {
    try {
      const data = fs.readFileSync(`./db/data.json`, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // Handle error, e.g., file not found
      console.error('Error reading data from JSON file:', error);
      return [];
    }
  }

  writeData(data: any): void {
    try {
      fs.writeFileSync(`./db/data.json`, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      // Handle error
      console.error('Error writing data to JSON file:', error);
    }
  }

  // Add new record
  addRecord(newRecord: any): void {
    const data = this.readData();
    data.push(newRecord);
    this.writeData(data);
  }
}