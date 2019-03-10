
set /p msg=Enter message: 

git add .
git commit -m "%msg%"
git push

cmd /k