/**
 * A small made-up Jefit export with the same structure and quirks as a real one: per-block header
 * rows, quoted names with commas, a trailing comma in logs, bodyweight sets, a cardio-style row,
 * an exercise renamed over time, a log whose session is missing, a custom exercise, and notes in
 * Greek. No real data.
 */
export const JEFIT_FIXTURE = `
### SETTING ##########################################

row_id,USERID,TIMESTAMP,gender,currentRoutine,name,length,mass,timer
1,42,"2026-09-14 17:51:44",M,7,," cm"," kg",90

######################################################

### PROFILE ##########################################

row_id,USERID,TIMESTAMP,_id,mydate,weight,fatpercent,chest,arms,waist,calves,height,hips,thighs,shoulders,neck,forearms,logTime
1,42,"2026-09-03 17:30:46",1,2024-01-10,80,15,100,38,0,0,180,0,0,0,0,0,1704880000
2,42,"2026-09-03 17:30:46",2,2024-03-10,78.5,0,0,0,0,0,180,0,0,0,0,0,1710070000
3,42,"2026-09-03 17:30:46",3,2024-04-10,0,0,0,0,0,0,180,0,0,0,0,0,1712750000

######################################################

### ROUTINES #########################################

row_id,USERID,TIMESTAMP,_id,name,difficulty,focus,dayaweek,description,daytype,tags,rdb_id,bannerCode,progression_flag
1,42,"2026-09-03 17:30:46",7,"Upper, Lower ",1,1,4,"Four days, heavy",0," ",0,,0

row_id,USERID,TIMESTAMP,package,_id,name,day,dayIndex,interval_mode,rest_day,week,sort_order,day_completed_timestamp
2,42,"2026-09-01 18:11:47",7,71,Lower,2,1,0,0,0,1,

row_id,USERID,TIMESTAMP,package,_id,name,day,dayIndex,interval_mode,rest_day,week,sort_order,day_completed_timestamp
3,42,"2026-09-01 18:11:47",7,70,Upper,1,0,0,0,0,0,

row_id,USERID,TIMESTAMP,belongSys,superset,_id,exercise_id,belongplan,exercisename,setcount,timer,logs,bodypart,mysort,targetrep,setdone,setdonetime,interval_time,interval_unit,rest_time_enabled,interval_time_enabled,is_tier_primary
4,42,"2026-09-11 17:29:55",1,0,1,12,71,"Barbell Squat",4,180,"105x4,105x4",8,0,"5,5,5,5",0,0,0,0,1,0,0

row_id,USERID,TIMESTAMP,belongSys,superset,_id,exercise_id,belongplan,exercisename,setcount,timer,logs,bodypart,mysort,targetrep,setdone,setdonetime,interval_time,interval_unit,rest_time_enabled,interval_time_enabled,is_tier_primary
5,42,"2026-09-11 17:29:55",1,0,2,3,70,"Barbell Bench Press",3,120,"",3,0,"12,10,8",0,0,0,0,1,0,0

row_id,USERID,TIMESTAMP,belongSys,superset,_id,exercise_id,belongplan,exercisename,setcount,timer,logs,bodypart,mysort,targetrep,setdone,setdonetime,interval_time,interval_unit,rest_time_enabled,interval_time_enabled,is_tier_primary
6,42,"2026-09-11 17:29:55",0,0,3,1,70,"Pendlay Row",3,90,"",1,1,"8,8,8",0,0,0,0,1,0,0

######################################################

### WORKOUT SESSIONS #################################

rowid,_id,USERID,edit_time,day_id,total_time,workout_time,rest_time,wasted_time,total_exercise,total_weight,recordbreak,starttime,endtime,workout_mode,TIMESTAMP,calories,avg_heart_rate
1,10,42,0,70,3600,0,0,0,2,0,0,1704906000,1704909600,0,"2026-04-25 09:18:05",0,0
2,11,42,0,71,3000,0,0,0,2,0,0,1705078800,1705081800,0,"2026-04-25 09:18:05",0,0
3,12,42,0,70,0,0,0,0,0,0,0,1705251600,1705251600,0,"2026-04-25 09:18:05",0,0

######################################################

### EXERCISE LOGS ####################################

USERID,TIMESTAMP,belongSys,logs,_id,record,mydate,eid,ename,day_item_id,belongsession,logTime,interval_logs,auto_generated
42,"2026-09-03 17:30:46",1,"60x10,60x10,60x8,",1,80,2024-01-10,3,"Bench Press",0,10,1704906000,,No
42,"2026-09-03 17:30:46",0,40x8,2,50,2024-01-10,1,"Pendlay Row",0,10,1704906000,,No
42,"2026-09-03 17:30:46",1,"100x5,100x5,100x5",3,116,2024-01-12,12,"Barbell Squat",0,11,1705078800,,No
42,"2026-09-03 17:30:46",1,"0x12,0x10",4,0,2024-01-12,61,"Hanging Leg Raise",0,11,1705078800,,No
42,"2026-09-03 17:30:46",1,"0x0.0,0x10",5,0,2024-01-12,500,"Treadmill",0,11,1705078800,,No
42,"2026-09-03 17:30:46",1,"62.5x10,62.5x9",6,83,2024-01-20,3,"Barbell Bench Press",0,99,1705748400,,No
42,"2026-09-03 17:30:46",1,"",7,0,2024-01-22,3,"",0,12,1705251600,,No

######################################################

### EXERCISE SET LOGS ################################

_id,userid,exercise_log_id,set_index,weight_lbs,reps,calories,distance_mi,speed_mph,laps,duration,set_type,log_time,TIMESTAMP
1,42,6,0,137.79,10,,,,,,default,1705748400,"2026-09-03 17:30:47"

######################################################

### CUSTOM EXERCISES #################################

row_id,USERID,TIMESTAMP,rating,name,description,image2,image1,bodypart,bodypart3,bodypart2,_id,equip1,equip2,recordtype,link,hashcode,unilateral,sys_exercise_map_id
1,42,"2026-09-03 17:30:46",0,"Pendlay Row",,0,0,1,11,11,1,0,0,0,,,0,

######################################################

### NOTES ############################################

row_id,TIMESTAMP,USERID,_id,eid,belongSys,mynote,title,mydate,logTime,label,bodypart,is_recovered,type
1,"2026-09-03 17:30:46",42,1,12,1,"στη μπάρα, χαμηλά","Barbell Squat",2024-01-12,1705078800,1705078800,-1,0,0

######################################################
`;
