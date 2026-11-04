import {TIERS, BOT_PROFILES} from './ranked-config.mjs';

// Fictional rival display names, not scraped players or real account identities.
// Ordering is append-only: IDs, tier, style, and seed remain stable across games.
const names = [
  'Aarav Shah','Vivaan Rao','Aditya Nair','Vihaan Sen','Arjun Iyer',
  'Sai Kumar','Reyansh Das','Ayaan Sethi','Krishna Menon','Ishaan Patel',
  'Shaurya Jain','Atharv Joshi','Advik Kapoor','Pranav Bose','Kabir Mehta',
  'Ritvik Bhat','Dhruv Sinha','Aryan Pillai','Yuvan Reddy','Ved Arora',
  'Ananya Shah','Diya Rao','Aadhya Nair','Saanvi Sen','Myra Iyer',
  'Aanya Kumar','Ira Das','Kiara Sethi','Avni Menon','Pari Patel',
  'Navya Jain','Riya Joshi','Anika Kapoor','Sara Bose','Meera Mehta',
  'Tara Bhat','Ishita Sinha','Nitya Pillai','Kavya Reddy','Veda Arora',
  'Karthik Ravi','Surya Mani','Vijay Arun','Ashwin Bala','Naveen Raj',
  'Prakash Siva','Harish Kannan','Dinesh Selvan','Ganesh Vasu','Vignesh Vel',
  'Ajay Mohan','Sanjay Anand','Deepak Hari','Varun Gopal','Rohit Murali',
  'Sathish Deva','Manoj Rishi','Nikhil Dev','Akash Ram','Bharath Arun',
  'Janani Ravi','Divya Mani','Priya Arun','Sneha Bala','Keerthi Raj',
  'Pavithra Siva','Harini Kannan','Nandini Vasu','Shreya Vel','Swathi Mohan',
  'Lakshmi Anand','Deepa Hari','Gayathri Ram','Revathi Gopal','Malini Murali',
  'Sandhya Deva','Anjali Rishi','Amala Dev','Bhavna Raj','Yamini Arun',
  'Dev Shah','Rohan Rao','Neel Nair','Aman Sen','Rahul Iyer',
  'Kunal Kumar','Tanmay Das','Yash Sethi','Om Menon','Samar Patel',
  'Parth Jain','Sahil Joshi','Rishi Kapoor','Mihir Bose','Ansh Mehta',
  'Tushar Bhat','Nitin Sinha','Vivek Pillai','Tejas Reddy','Abhay Arora',
  'Neha Shah','Pooja Rao','Sana Nair','Aditi Sen','Simran Iyer',
  'Kriti Kumar','Rhea Das','Naina Sethi','Sonal Menon','Mahi Patel',
  'Jiya Jain','Trisha Joshi','Esha Kapoor','Rupali Bose','Tanvi Mehta',
  'Palak Bhat','Aisha Sinha','Sakshi Pillai','Isha Reddy','Zoya Arora',
  'Arnav Dutta','Soham Roy','Ishan Pal','Rudra Ghosh','Niloy Saha',
  'Deb Sen','Anirban Das','Joy Banerjee','Arka Ghosh','Ritam Dey',
  'Anushka Dutta','Sohini Roy','Oindrila Pal','Roshni Ghosh','Moumita Saha',
  'Ritu Sen','Mitali Das','Piya Banerjee','Keya Ghosh','Rini Dey',
  'Minh Tran','Linh Nguyen','Bao Le','Mai Pham','An Vo',
  'Huy Dang','Thao Bui','Nam Ho','Nhi Do','Duy Vu',
  'Wei Lin','Mei Chen','Jun Wang','Jia Liu','Hao Zhang',
  'Xin Wu','Yan Zhou','Tao Xu','Ning Zhao','Lei Sun',
  'Haru Mori','Yui Sato','Ren Ito','Aoi Kato','Sora Abe',
  'Mina Kim','Joon Park','Yuna Lee','Jiho Han','Ara Choi',
  'Adi Putra','Sari Dewi','Budi Hadi','Ayu Sari','Rina Tan',
  'Niran Chai','Mali Arun','Somchai Lek','Dara Sok','Sophea Lim',
];

export const BOT_IDENTITIES = Object.freeze(names.map((name,index) => {
  const tier = TIERS[index % TIERS.length];
  const profiles = BOT_PROFILES.filter(p=>p.tierId===tier.id);
  return Object.freeze({id:`rival-${String(index+1).padStart(3,'0')}`,name,
    profileId:profiles[Math.floor(index/TIERS.length)%profiles.length].id,
    seed:10001+index});
}));
